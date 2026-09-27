import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.ts'
import { runtimeConfig } from '../src/config.ts'
import { SqliteDatabase } from '../src/store/local.ts'

test('Render configuration uses PORT, HTTPS origin and Turso; missing credentials fail closed',async()=>{
  const config=runtimeConfig({RENDER:'true',PORT:'10000',RENDER_EXTERNAL_URL:'https://carry.onrender.com',TURSO_DATABASE_URL:'libsql://carry.example',TURSO_AUTH_TOKEN:'placeholder'})
  assert.equal(config.host,'0.0.0.0')
  assert.equal(config.port,10000)
  assert.equal(config.origin,'https://carry.onrender.com')
  assert.equal(config.serveWeb,true)
  assert.ok(config.database)
  await config.database.close()
  assert.throws(()=>runtimeConfig({RENDER:'true'}),/requires TURSO/)
  assert.throws(()=>runtimeConfig({TURSO_AUTH_TOKEN:'placeholder'}),/TURSO_DATABASE_URL/)
  assert.throws(()=>runtimeConfig({PORT:'invalid'}),/PORT/)
  assert.equal(runtimeConfig({}).host,'127.0.0.1')
})

test('production serves browser routes and assets but preserves JSON API and file errors',async t=>{
  const webRoot=mkdtempSync(join(tmpdir(),'carry-web-'))
  writeFileSync(join(webRoot,'index.html'),'<!doctype html><div id="root">Carry</div>')
  writeFileSync(join(webRoot,'app.js'),'document.title="Carry"')
  const app=createApp({serveWeb:true,webRoot,origin:'https://carry.example',rateLimit:false})
  t.after(async()=>{await app.close();rmSync(webRoot,{recursive:true,force:true})})
  for(const url of ['/','/pair','/inbox']) {
    const response=await app.inject({url,headers:{accept:'text/html'}})
    assert.equal(response.statusCode,200,response.body)
    assert.match(response.headers['content-type']!,/text\/html/)
    assert.match(response.body,/id="root"/)
    assert.match(String(response.headers['content-security-policy']),/script-src 'self'/)
  }
  const asset=await app.inject('/app.js')
  assert.equal(asset.statusCode,200)
  assert.match(asset.body,/document.title/)
  for(const url of ['/api','/api/missing','/assets/missing.js','/missing.js']) {
    const response=await app.inject({url,headers:{accept:'text/html'}})
    assert.equal(response.statusCode,404)
    assert.match(response.headers['content-type']!,/application\/json/)
    assert.deepEqual(response.json(),{error:'Not found.'})
  }
  assert.equal((await app.inject({method:'POST',url:'/inbox'})).statusCode,404)
  assert.deepEqual((await app.inject('/api/health')).json(),{ok:true})
})

test('async local transactions isolate concurrent requests and roll back only their own writes',async t=>{
  const db=new SqliteDatabase(':memory:')
  t.after(()=>db.close())
  await db.initialize()
  await db.run('INSERT INTO devices VALUES (?,?)','original','before')
  let markEntered!:()=>void,release!:()=>void
  const entered=new Promise<void>(resolve=>{markEntered=resolve})
  const released=new Promise<void>(resolve=>{release=resolve})
  const transaction=db.transaction(async tx=>{
    await tx.run('UPDATE devices SET bundle=? WHERE id=?','uncommitted','original')
    markEntered()
    await released
    throw new Error('rollback fixture')
  })
  const rejected=assert.rejects(transaction,/rollback fixture/)
  await entered
  const otherRequest=db.run('INSERT INTO devices VALUES (?,?)','other','committed')
  const read=db.get('SELECT bundle FROM devices WHERE id=?','original')
  release()
  await rejected
  await otherRequest
  assert.equal((await read)!.bundle,'before')
  assert.equal((await db.get('SELECT bundle FROM devices WHERE id=?','other'))!.bundle,'committed')
})

test('a share POST without interception is redirected without parsing or echoing its body',async t=>{
  const app=createApp({rateLimit:false})
  t.after(()=>app.close())
  const response=await app.inject({method:'POST',url:'/share-target',headers:{'content-type':'application/json'},payload:'not JSON: private shared content'})
  assert.equal(response.statusCode,303)
  assert.equal(response.headers.location,'/#capture-error=share-unavailable')
  assert.equal(response.body,'')
})
