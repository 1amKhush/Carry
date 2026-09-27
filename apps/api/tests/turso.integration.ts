import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalMessage, decryptCard, encryptCard, generateIdentity, sign } from '@carry/crypto'
import { RETENTION_MS, type Pair } from '@carry/protocol/secure'
import { createApp } from '../src/app.ts'
import { TursoDatabase } from '../src/store/turso.ts'
import { authenticate, invite, origin } from './helpers.ts'

test('Turso: authenticated pairing, concurrent retry, restart, privacy, receipts, expiry filtering and unpair', {timeout:120000}, async t=>{
  const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN
  assert.ok(url&&authToken,'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to run the live integration test.')
  const connect=()=>new TursoDatabase({url,authToken})
  // Live tests never run global expiry cleanup. Every deletion below is scoped
  // to freshly generated identities or the exact expired fixture ID.
  const start=()=>createApp({database:connect(),origin,rateLimit:false,automaticCleanup:false})
  let app=start(),parallel=start()
  const inspector=connect()
  const a=await generateIdentity(),b=await generateIdentity(),outsider=await generateIdentity()
  const ids=[a.public.id,b.public.id,outsider.public.id]
  t.after(async()=>{
    await Promise.all([app.close(),parallel.close()])
    try {
      await inspector.transaction(async tx=>{
        const marks=ids.map(()=>'?').join(',')
        for(const [table,predicate,args] of [
          ['envelopes',`sender IN (${marks}) OR recipient IN (${marks})`,[...ids,...ids]],
          ['dedupe',`sender IN (${marks})`,ids],
          ['invitations',`inviter IN (${marks}) OR joiner IN (${marks})`,[...ids,...ids]],
          ['pairs',`inviter IN (${marks}) OR joiner IN (${marks})`,[...ids,...ids]],
          ['challenges',`device_id IN (${marks})`,ids],
          ['sessions',`device_id IN (${marks})`,ids],
          ['devices',`id IN (${marks})`,ids],
        ] as const)await tx.run(`DELETE FROM ${table} WHERE ${predicate}`,...args)
      })
    } finally {await inspector.close()}
  })
  await app.ready()
  await parallel.ready()
  const ah=await authenticate(app,a),bh=await authenticate(app,b),oh=await authenticate(app,outsider)
  const invitation=await invite(app,a,ah),pairUrl='/api/v1/pairings/'+invitation.id
  const joined=await app.inject({method:'POST',url:pairUrl+'/join',headers:bh,payload:{secret:invitation.secret}})
  assert.equal(joined.statusCode,200,joined.body)
  const paired=joined.json().pair as Pair
  const content={id:crypto.randomUUID(),title:'PRIVATE-TURSO-TITLE-'+crypto.randomUUID(),primaryUrl:'https://example.com/private?x=a%2Fb&y=2#exact',relatedUrls:[],note:'PRIVATE-TURSO-NOTE-'+crypto.randomUUID(),goal:'PRIVATE-TURSO-GOAL-'+crypto.randomUUID(),nextAction:'PRIVATE-TURSO-ACTION-'+crypto.randomUUID(),excerpt:'PRIVATE-TURSO-EXCERPT-'+crypto.randomUUID(),createdAt:new Date().toISOString()}
  const envelope=await encryptCard(a,b.public,paired.id,content)
  const send=(target=app,payload=envelope)=>target.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload})
  assert.equal((await send()).statusCode,403)
  const message=await approvalMessage(paired)
  const approvals=await Promise.all([
    app.inject({method:'POST',url:pairUrl+'/approve',headers:ah,payload:{signature:await sign(a,message)}}),
    parallel.inject({method:'POST',url:pairUrl+'/approve',headers:bh,payload:{signature:await sign(b,message)}}),
  ])
  for(const response of approvals)assert.equal(response.statusCode,200,response.body)
  assert.equal((await app.inject({url:pairUrl,headers:ah})).json().pair.active,true)
  const retries=await Promise.all([send(),send(parallel),send(),send(parallel)])
  for(const response of retries){assert.equal(response.statusCode,201,response.body);assert.equal(response.json().status,'queued')}
  assert.equal(Number((await inspector.get('SELECT count(*) n FROM envelopes WHERE id=?',envelope.id))!.n),1)
  const changed=await encryptCard(a,b.public,paired.id,content)
  assert.equal((await send(app,changed)).statusCode,409)
  assert.equal((await app.inject('/api/v1/inbox')).statusCode,401)
  assert.deepEqual((await app.inject({url:'/api/v1/inbox',headers:oh})).json().envelopes,[])
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:oh,payload:{status:'received'}})).statusCode,404)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:content})).statusCode,400)
  const stored=String((await inspector.get('SELECT payload FROM envelopes WHERE id=?',envelope.id))!.payload)
  for(const secret of [content.title,content.primaryUrl,content.note,content.goal,content.nextAction,content.excerpt])assert.equal(stored.includes(secret),false)
  await Promise.all([app.close(),parallel.close()])
  app=start();parallel=start()
  const inbox=(await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes
  assert.equal(inbox.length,1)
  assert.deepEqual(await decryptCard(b,a.public,paired.id,inbox[0]),content)
  for(const status of ['received','continued','received']) {
    const response=await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:bh,payload:{status}})
    assert.equal(response.statusCode,200,response.body)
  }
  assert.equal((await send()).json().status,'continued')
  assert.equal((await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes.length,1)
  assert.equal((await app.inject({url:'/api/v1/outbox',headers:ah})).json().receipts[0].status,'continued')
  const expired=await encryptCard(a,b.public,paired.id,{...content,id:crypto.randomUUID(),createdAt:new Date(Date.now()-RETENTION_MS-1000).toISOString()})
  assert.equal((await send(app,expired)).statusCode,410)
  await inspector.run('INSERT INTO envelopes VALUES (?,?,?,?,?,?,?,NULL,NULL)',expired.id,a.public.id,b.public.id,paired.id,expired.expiresAt,JSON.stringify(expired),expired.createdAt)
  assert.equal((await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes.length,1)
  // Delete only this test's expired fixture, never other users' expired data.
  assert.equal((await inspector.run('DELETE FROM envelopes WHERE id=? AND expires_at<=?',expired.id,Date.now())).changes,1)
  const raceEnvelope=await encryptCard(a,b.public,paired.id,{...content,id:crypto.randomUUID()})
  const [racingSend,unpair]=await Promise.all([
    send(parallel,raceEnvelope),app.inject({method:'DELETE',url:'/api/v1/pairs/'+paired.id,headers:bh}),
  ])
  assert.ok([201,403].includes(racingSend.statusCode),racingSend.body)
  assert.equal(unpair.statusCode,200,unpair.body)
  assert.equal(Number((await inspector.get('SELECT count(*) n FROM envelopes WHERE pair_id=?',paired.id))!.n),0)
  assert.equal((await send()).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:bh,payload:{status:'received'}})).statusCode,404)
  const challenge=(await app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{deviceId:a.public.id}})).json()
  const payload={deviceId:a.public.id,challengeId:challenge.id,signature:await sign(a,JSON.stringify(['carry.auth.v1',origin,a.public.id,challenge.id,challenge.nonce,challenge.expiresAt]))}
  const sessions=await Promise.all([app,parallel].map(target=>target.inject({method:'POST',url:'/api/v1/auth/session',payload})))
  assert.deepEqual(sessions.map(response=>response.statusCode).sort(),[200,401])
})
