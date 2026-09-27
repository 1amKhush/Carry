import assert from 'node:assert/strict'
import { approvalMessage, hash, randomToken, sign, type Identity } from '@carry/crypto'
import { invitationMessage, type Pair } from '@carry/protocol/secure'
import type { createApp } from '../src/app.ts'
export const origin='https://carry.example'
type App=ReturnType<typeof createApp>
export async function authenticate(app:App,identity:Identity) {
  const registered=await app.inject({method:'POST',url:'/api/v1/devices',payload:{bundle:identity.public}})
  assert.equal(registered.statusCode,201,registered.body)
  const challenge=(await app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{deviceId:identity.public.id}})).json()
  const payload={deviceId:identity.public.id,challengeId:challenge.id,signature:await sign(identity,JSON.stringify(['carry.auth.v1',origin,identity.public.id,challenge.id,challenge.nonce,challenge.expiresAt]))}
  const session=await app.inject({method:'POST',url:'/api/v1/auth/session',payload})
  assert.equal(session.statusCode,200,session.body)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/session',payload})).statusCode,401)
  return {authorization:'Bearer '+session.json().token}
}
export async function invite(app:App,a:Identity,headers:Record<string,string>) {
  const invitation={id:crypto.randomUUID(),origin,inviter:a.public,expiresAt:Date.now()+290000}
  const secret=randomToken(),secretHash=await hash(secret)
  const response=await app.inject({method:'POST',url:'/api/v1/pairings',headers,payload:{id:invitation.id,expiresAt:invitation.expiresAt,secretHash,signature:await sign(a,invitationMessage(invitation,secretHash))}})
  assert.equal(response.statusCode,201,response.body)
  return {...invitation,secret}
}
export async function pair(app:App,a:Identity,b:Identity,ah:Record<string,string>,bh:Record<string,string>) {
  const invitation=await invite(app,a,ah)
  const joined=await app.inject({method:'POST',url:'/api/v1/pairings/'+invitation.id+'/join',headers:bh,payload:{secret:invitation.secret}})
  assert.equal(joined.statusCode,200,joined.body)
  const pair=joined.json().pair as Pair
  for(const [identity,headers] of [[a,ah],[b,bh]] as const) {
    const approved=await app.inject({method:'POST',url:'/api/v1/pairings/'+pair.id+'/approve',headers,payload:{signature:await sign(identity,await approvalMessage(pair))}})
    assert.equal(approved.statusCode,200,approved.body)
  }
  return pair
}
