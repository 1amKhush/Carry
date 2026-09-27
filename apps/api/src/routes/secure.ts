import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { approvalMessage, hash, randomToken, validatePublicDevice, verify, verifyEnvelope } from '@carry/crypto'
import { bundleSchema, deviceIdSchema, envelopeSchema, invitationMessage, INVITATION_MS, jsonSchema, receiptSchema, uuidSchema, z, type Pair, type PublicDevice } from '@carry/protocol/secure'
import { RelayError, type RelayStore } from '../store/sqlite.ts'
import type { SqlExecutor, SqlRow } from '../store/database.ts'

export function registerSecure(app:FastifyInstance,store:RelayStore,origin:string,now:()=>number) {
  const db=store.db
  const fail=(status:number,message:string):never=>{throw new RelayError(status,message)}
  const device=async(id:string,connection:SqlExecutor=db):Promise<PublicDevice>=>{
    const row=await connection.get('SELECT bundle FROM devices WHERE id=?',id)
    return row?JSON.parse(String(row.bundle)) as PublicDevice:fail(404,'Device unavailable.')
  }
  const authenticate=async(request:FastifyRequest)=>{
    const token=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
    if(!token)return fail(401,'Device authentication required.')
    const row=await db.get('SELECT device_id FROM sessions WHERE token_hash=? AND expires_at>?',await hash(token),now())
    return row?String(row.device_id):fail(401,'Session expired.')
  }
  const activePair=async(id:string,member:string):Promise<Pair>=>{
    const row=await db.get('SELECT proof FROM pairs WHERE id=? AND revoked=0 AND (inviter=? OR joiner=?)',id,member,member)
    return row?JSON.parse(String(row.proof)) as Pair:fail(403,'An active pairing is required.')
  }
  const pending=async(id:string,member:string,connection:SqlExecutor=db)=>{
    const row=await connection.get('SELECT * FROM invitations WHERE id=? AND expires_at>? AND (inviter=? OR joiner=?)',id,now(),member,member)
    return row??fail(404,'Invitation unavailable or expired.')
  }
  const pendingPair=async(row:SqlRow,connection:SqlExecutor=db):Promise<Pair|null>=>row.joiner?{
    id:String(row.id),origin,expiresAt:Number(row.expires_at),
    inviter:await device(String(row.inviter),connection),joiner:await device(String(row.joiner),connection),
    inviterSignature:row.inviter_signature?String(row.inviter_signature):null,
    joinerSignature:row.joiner_signature?String(row.joiner_signature):null,active:false,
  }:null
  const schema=(body:z.ZodType)=>({body:jsonSchema(body)})
  const idParams={params:jsonSchema(z.strictObject({id:uuidSchema}))}
  const authLimit={rateLimit:{max:30,timeWindow:'1 minute'}}
  const binary=z.string().regex(/^[A-Za-z0-9_-]+$/)

  app.get('/api/health',async()=>{await db.get('SELECT 1 AS ok');return {ok:true}})
  app.post<{Body:{bundle:PublicDevice}}>('/api/v1/devices',{schema:schema(z.strictObject({bundle:bundleSchema})),config:authLimit},async(req,reply)=>{
    const bundle=await validatePublicDevice(req.body.bundle).catch(()=>fail(400,'Invalid device keys.'))
    await store.transaction(async tx=>{
      const existing=await tx.get('SELECT bundle FROM devices WHERE id=?',bundle.id)
      if(!existing) {
        if(Number((await tx.get('SELECT count(*) AS n FROM devices'))!.n)>=1000)return fail(503,'Device capacity reached.')
        await tx.run('INSERT INTO devices VALUES (?,?)',bundle.id,JSON.stringify(bundle))
      } else {
        const old=JSON.parse(String(existing.bundle)) as PublicDevice
        if(old.signingKey!==bundle.signingKey||old.agreementKey!==bundle.agreementKey)return fail(409,'Device keys cannot be replaced.')
      }
    })
    return reply.code(201).send({id:bundle.id})
  })
  app.post<{Body:{deviceId:string}}>('/api/v1/auth/challenge',{schema:schema(z.strictObject({deviceId:deviceIdSchema})),config:authLimit},async req=>{
    await device(req.body.deviceId)
    const challenge={id:randomUUID(),nonce:randomToken(),expiresAt:now()+60_000}
    await db.run('INSERT INTO challenges VALUES (?,?,?,?,?)',challenge.id,req.body.deviceId,challenge.nonce,challenge.expiresAt,origin)
    return challenge
  })
  app.post<{Body:{deviceId:string;challengeId:string;signature:string}}>('/api/v1/auth/session',{schema:schema(z.strictObject({deviceId:deviceIdSchema,challengeId:uuidSchema,signature:binary.length(86)})),config:authLimit},async req=>{
    const {deviceId,challengeId,signature}=req.body
    const row=await db.get('SELECT * FROM challenges WHERE id=? AND device_id=? AND expires_at>?',challengeId,deviceId,now())
    if(!row)return fail(401,'Challenge unavailable.')
    const message=JSON.stringify(['carry.auth.v1',origin,deviceId,challengeId,row.nonce,row.expires_at])
    if(!await verify(await device(deviceId),message,signature))return fail(401,'Invalid device proof.')
    const token=randomToken(),digest=await hash(token),expiresAt=now()+86400_000
    await store.transaction(async tx=>{
      if(!(await tx.run('DELETE FROM challenges WHERE id=? AND device_id=? AND expires_at>?',challengeId,deviceId,now())).changes)return fail(401,'Challenge already used.')
      await tx.run('INSERT INTO sessions VALUES (?,?,?)',digest,deviceId,expiresAt)
    })
    return {token,expiresAt}
  })
  app.post<{Body:{id:string;secretHash:string;expiresAt:number;signature:string}}>('/api/v1/pairings',{schema:schema(z.strictObject({id:uuidSchema,secretHash:binary.length(43),expiresAt:z.number().int(),signature:binary.length(86)}))},async(req,reply)=>{
    const member=await authenticate(req),{id,secretHash,expiresAt,signature}=req.body
    if(expiresAt<=now()||expiresAt>now()+INVITATION_MS)return fail(400,'Invalid invitation lifetime.')
    const inviter=await device(member)
    if(!await verify(inviter,invitationMessage({id,origin,inviter,expiresAt},secretHash),signature))return fail(400,'Invalid invitation signature.')
    await store.transaction(async tx=>{
      if(await tx.get('SELECT id FROM invitations WHERE id=? UNION SELECT id FROM pairs WHERE id=?',id,id))return fail(409,'Invitation ID already used.')
      await tx.run('INSERT INTO invitations VALUES (?,?,?,?,?,NULL,NULL,NULL)',id,member,secretHash,expiresAt,signature)
    })
    return reply.code(201).send({id,expiresAt})
  })
  app.post<{Params:{id:string};Body:{secret:string}}>('/api/v1/pairings/:id/join',{schema:{...idParams,...schema(z.strictObject({secret:binary.length(43)}))}},async req=>{
    const member=await authenticate(req),secretHash=await hash(req.body.secret)
    return store.transaction(async tx=>{
      const row=await tx.get('SELECT * FROM invitations WHERE id=? AND expires_at>? AND secret_hash=?',req.params.id,now(),secretHash)
      if(!row||row.inviter===member)return fail(404,'Invitation unavailable.')
      if(row.joiner&&row.joiner!==member)return fail(409,'Invitation already claimed.')
      await tx.run('UPDATE invitations SET joiner=? WHERE id=?',member,req.params.id)
      return {pair:await pendingPair({...row,joiner:member},tx)}
    })
  })
  app.get<{Params:{id:string}}>('/api/v1/pairings/:id',{schema:idParams},async req=>{
    const member=await authenticate(req)
    const row=await db.get('SELECT proof FROM pairs WHERE id=? AND revoked=0 AND (inviter=? OR joiner=?)',req.params.id,member,member)
    if(row)return {pair:JSON.parse(String(row.proof)) as Pair}
    const invitation=await pending(req.params.id,member)
    return {pair:await pendingPair(invitation),expiresAt:Number(invitation.expires_at)}
  })
  app.post<{Params:{id:string};Body:{signature:string}}>('/api/v1/pairings/:id/approve',{schema:{...idParams,...schema(z.strictObject({signature:binary.length(86)}))}},async req=>{
    const member=await authenticate(req)
    const pair=await pendingPair(await pending(req.params.id,member))
    if(!pair)return fail(409,'Wait for the other device.')
    if(!await verify(await device(member),await approvalMessage(pair),req.body.signature))return fail(400,'Invalid pairing approval.')
    return store.transaction(async tx=>{
      const fresh=await pending(req.params.id,member,tx)
      const column=member===pair.inviter.id?'inviter_signature':'joiner_signature'
      await tx.run(`UPDATE invitations SET ${column}=? WHERE id=?`,req.body.signature,req.params.id)
      const updated=(await pendingPair({...fresh,[column]:req.body.signature},tx))!
      if(updated.inviterSignature&&updated.joinerSignature) {
        updated.active=true
        await tx.run('INSERT INTO pairs VALUES (?,?,?,?,0) ON CONFLICT(id) DO NOTHING',updated.id,updated.inviter.id,updated.joiner.id,JSON.stringify(updated))
      }
      return {pair:updated}
    })
  })
  app.get('/api/v1/peers',async req=>{
    const member=await authenticate(req)
    return {pairs:(await db.all('SELECT proof FROM pairs WHERE revoked=0 AND (inviter=? OR joiner=?)',member,member)).map(row=>JSON.parse(String(row.proof)) as Pair)}
  })
  app.delete<{Params:{id:string}}>('/api/v1/pairs/:id',{schema:idParams},async req=>{
    const member=await authenticate(req)
    await store.transaction(async tx=>{
      const row=await tx.get('SELECT id FROM pairs WHERE id=? AND (inviter=? OR joiner=?)',req.params.id,member,member)
      if(!row)return fail(404,'Pair unavailable.')
      await tx.run('UPDATE pairs SET revoked=1 WHERE id=?',req.params.id)
      await tx.run('DELETE FROM invitations WHERE id=?',req.params.id)
      await tx.run('DELETE FROM envelopes WHERE pair_id=?',req.params.id)
    })
    return {ok:true}
  })
  app.post<{Body:z.infer<typeof envelopeSchema>}>('/api/v1/envelopes',{schema:schema(envelopeSchema)},async(req,reply)=>{
    const member=await authenticate(req),e=req.body
    if(member!==e.senderId)return fail(403,'Sender does not match authenticated device.')
    const pair=await activePair(e.pairId,member)
    if(![pair.inviter.id,pair.joiner.id].includes(e.recipientId)||e.recipientId===member)return fail(403,'Recipient is not paired.')
    if(!await verifyEnvelope(e,await device(member)))return fail(400,'Invalid envelope signature.')
    // The store rechecks pairing within the commit transaction, after async crypto.
    return reply.code(201).send({id:e.id,status:await store.enqueue(e,now())})
  })
  app.get('/api/v1/inbox',async req=>({envelopes:await store.inbox(await authenticate(req),now())}))
  app.get('/api/v1/outbox',async req=>{
    const member=await authenticate(req)
    return {receipts:(await db.all('SELECT id,received_at,continued_at FROM envelopes WHERE sender=? AND expires_at>?',member,now()))
      .map(row=>({id:String(row.id),status:row.continued_at!==null?'continued':row.received_at!==null?'received':'queued'}))}
  })
  app.post<{Params:{id:string};Body:{status:'received'|'continued'}}>('/api/v1/envelopes/:id/receipt',{schema:{...idParams,...schema(z.strictObject({status:receiptSchema}))}},async req=>{
    await store.receipt(req.params.id,await authenticate(req),req.body.status,now())
    return {ok:true}
  })
}
