import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { approvalMessage, decryptCard, encryptCard, generateIdentity, randomToken, sign } from '@carry/crypto'
import { envelopeHeader, RETENTION_MS, type Pair } from '@carry/protocol/secure'
import { createApp } from '../src/app.ts'

import { authenticate, invite, pair, origin } from './helpers.ts'
const card=()=>({id:crypto.randomUUID(),title:'CONFIDENTIAL-TITLE-672ac1',primaryUrl:'https://example.com/private/path?x=a%2Fb&y=2#exact',relatedUrls:['http://example.com/reference'],note:'CONFIDENTIAL-NOTE-f06217',createdAt:new Date().toISOString()})

test('authenticated encrypted delivery survives restart, retries once, retains receipts, hides content, and expires',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'carry-relay-')),databasePath=join(directory,'relay.sqlite')
  let now=Date.now()
  let app=createApp({databasePath,origin,now:()=>now,rateLimit:false})
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})})
  const a=await generateIdentity(),b=await generateIdentity(),outsider=await generateIdentity()
  const ah=await authenticate(app,a),bh=await authenticate(app,b),oh=await authenticate(app,outsider)
  const paired=await pair(app,a,b,ah,bh), content=card()
  const envelope=await encryptCard(a,b.public,paired.id,content)
  const send=()=>app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:envelope})
  assert.equal((await send()).statusCode,201)
  assert.equal((await send()).json().status,'queued')
  const changed=await encryptCard(a,b.public,paired.id,content)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:changed})).statusCode,409)
  assert.equal((await app.inject('/api/v1/inbox')).statusCode,401)
  assert.deepEqual((await app.inject({url:'/api/v1/inbox',headers:oh})).json().envelopes,[])
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:oh,payload:{status:'received'}})).statusCode,404)
  assert.equal((await app.inject('/api/dev/inbox/'+b.public.id)).statusCode,404)
  await app.close()
  const disk=readFileSync(databasePath).toString('utf8')
  for(const text of [content.title,content.primaryUrl,content.note,...content.relatedUrls])assert.equal(disk.includes(text),false,text)
  app=createApp({databasePath,origin,now:()=>now,rateLimit:false})
  const inbox=(await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes
  assert.equal(inbox.length,1)
  assert.deepEqual(await decryptCard(b,a.public,paired.id,inbox[0]),content)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:bh,payload:{status:'continued'}})).statusCode,409)
  for(const status of ['received','continued','received'])assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:bh,payload:{status}})).statusCode,200)
  assert.equal((await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes.length,1)
  assert.equal((await send()).json().status,'continued')
  assert.equal((await app.inject({url:'/api/v1/outbox',headers:ah})).json().receipts[0].status,'continued')
  now=envelope.expiresAt+1
  await app.inject('/api/health')
  const db=new DatabaseSync(databasePath)
  assert.equal(db.prepare('SELECT count(*) AS n FROM envelopes').get()!.n,0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM dedupe').get()!.n,1)
  db.close()
})

test('pairing requires invitation secret and both approvals; unpair denies send and acknowledgment',async t=>{
  const app=createApp({origin,rateLimit:false});t.after(()=>app.close())
  const a=await generateIdentity(),b=await generateIdentity(),c=await generateIdentity()
  const ah=await authenticate(app,a),bh=await authenticate(app,b),ch=await authenticate(app,c)
  const invitation=await invite(app,a,ah),url='/api/v1/pairings/'+invitation.id
  assert.equal((await app.inject({method:'POST',url:url+'/join',headers:bh,payload:{secret:randomToken()}})).statusCode,404)
  const joined=await app.inject({method:'POST',url:url+'/join',headers:bh,payload:{secret:invitation.secret}})
  const pair=joined.json().pair as Pair
  assert.equal((await app.inject({method:'POST',url:url+'/join',headers:ch,payload:{secret:invitation.secret}})).statusCode,409)
  assert.equal((await app.inject({url,headers:ch})).statusCode,404)
  const envelope=await encryptCard(a,b.public,pair.id,card())
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:envelope})).statusCode,403)
  const message=await approvalMessage(pair)
  assert.equal((await app.inject({method:'POST',url:url+'/approve',headers:bh,payload:{signature:await sign(a,message)}})).statusCode,400)
  await app.inject({method:'POST',url:url+'/approve',headers:ah,payload:{signature:await sign(a,message)}})
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:envelope})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:url+'/approve',headers:bh,payload:{signature:await sign(b,message)}})).json().pair.active,true)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:envelope})).statusCode,201)
  assert.equal((await app.inject({method:'DELETE',url:'/api/v1/pairs/'+pair.id,headers:ch})).statusCode,404)
  assert.equal((await app.inject({method:'DELETE',url:'/api/v1/pairs/'+pair.id,headers:bh})).statusCode,200)
  assert.deepEqual((await app.inject({url:'/api/v1/inbox',headers:bh})).json().envelopes,[])
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:envelope})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes/'+envelope.id+'/receipt',headers:bh,payload:{status:'received'}})).statusCode,404)
  assert.equal((await app.inject({method:'POST',url:url+'/approve',headers:bh,payload:{signature:await sign(b,message)}})).statusCode,404)
})

test('plaintext, malformed envelopes, bad signatures, origin mismatch and false identity proofs are rejected',async t=>{
  const app=createApp({origin,rateLimit:false});t.after(()=>app.close())
  const a=await generateIdentity(),b=await generateIdentity()
  const ah=await authenticate(app,a),bh=await authenticate(app,b),paired=await pair(app,a,b,ah,bh)
  const envelope=await encryptCard(a,b.public,paired.id,card())
  for(const payload of [card(),{recipientDeviceId:b.public.id,card:card()},{...envelope,note:'plaintext'},{...envelope,version:2},{...envelope,iv:'bad'},{...envelope,ciphertext:'A'.repeat(44000)},{...envelope,createdAt:String(envelope.createdAt)}]) {
    assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload})).statusCode,400)
  }
  assert.equal((await app.inject({method:'POST',url:'/api/dev/handoffs',payload:{card:card()}})).statusCode,404)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:{...envelope,ciphertext:envelope.ciphertext.slice(0,-4)+'AAAA'}})).statusCode,400)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:bh,payload:envelope})).statusCode,403)
  assert.equal((await app.inject({url:'/api/v1/inbox',headers:{...bh,origin:'https://attacker.example'}})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/devices',payload:{bundle:{...a.public,id:b.public.id}}})).statusCode,400)
  const challenge=(await app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{deviceId:b.public.id}})).json()
  const signature=await sign(a,JSON.stringify(['carry.auth.v1',origin,b.public.id,challenge.id,challenge.nonce,challenge.expiresAt]))
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/session',payload:{deviceId:b.public.id,challengeId:challenge.id,signature}})).statusCode,401)
  const stale={...envelope,expiresAt:envelope.createdAt+RETENTION_MS+1}
  stale.signature=await sign(a,JSON.stringify(['carry.envelope.v1',envelopeHeader(stale),stale.ciphertext]))
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:ah,payload:stale})).statusCode,400)
})

test('expired invitations and challenges cannot authorize a device',async t=>{
  let now=Date.now()
  const app=createApp({origin,now:()=>now,rateLimit:false});t.after(()=>app.close())
  const a=await generateIdentity(),b=await generateIdentity(),ah=await authenticate(app,a),bh=await authenticate(app,b)
  const invitation=await invite(app,a,ah)
  const challenge=(await app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{deviceId:a.public.id}})).json()
  now+=301000
  assert.equal((await app.inject({method:'POST',url:'/api/v1/pairings/'+invitation.id+'/join',headers:bh,payload:{secret:invitation.secret}})).statusCode,404)
  const signature=await sign(a,JSON.stringify(['carry.auth.v1',origin,a.public.id,challenge.id,challenge.nonce,challenge.expiresAt]))
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/session',payload:{deviceId:a.public.id,challengeId:challenge.id,signature}})).statusCode,401)
})
