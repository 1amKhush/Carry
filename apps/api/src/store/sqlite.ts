import { createHash } from 'node:crypto'
import { envelopeBytes, RETENTION_MS, type Envelope, type Receipt } from '@carry/protocol/secure'
import type { RelayDatabase, SqlExecutor } from './database.ts'
import { SqliteDatabase } from './local.ts'

export class RelayError extends Error {
  statusCode:number
  constructor(statusCode:number,message:string) {super(message);this.statusCode=statusCode}
}

export class RelayStore {
  db: RelayDatabase
  constructor(database: string | RelayDatabase) {
    this.db = typeof database==='string' ? new SqliteDatabase(database) : database
  }
  initialize() { return this.db.initialize() }
  transaction<T>(action:(tx:SqlExecutor)=>Promise<T>):Promise<T> {return this.db.transaction(action)}
  async enqueue(e:Envelope,now=Date.now()):Promise<Receipt> {
    if(e.expiresAt<=now)throw new RelayError(410,'Envelope expired.')
    if(e.expiresAt>e.createdAt+RETENTION_MS || e.createdAt>now+300_000 || e.expiresAt<=e.createdAt)throw new RelayError(400,'Invalid envelope lifetime.')
    const digest=createHash('sha256').update(envelopeBytes(e)).digest('base64url')
    return this.transaction(async tx=>{
      // Authorization and insertion share the write lock with Unpair.
      const pair=await tx.get('SELECT id FROM pairs WHERE id=? AND revoked=0 AND ((inviter=? AND joiner=?) OR (inviter=? AND joiner=?))',e.pairId,e.senderId,e.recipientId,e.recipientId,e.senderId)
      if(!pair)throw new RelayError(403,'An active pairing is required.')
      const old=await tx.get('SELECT sender,digest FROM dedupe WHERE id=?',e.id)
      if(old) {
        if(old.sender!==e.senderId || old.digest!==digest)throw new RelayError(409,'Idempotency key already used with different data.')
        const row=await tx.get('SELECT received_at,continued_at FROM envelopes WHERE id=?',e.id)
        if(!row)throw new RelayError(410,'Envelope is no longer available.')
        return row.continued_at!==null?'continued':row.received_at!==null?'received':'queued'
      }
      if(Number((await tx.get('SELECT count(*) AS n FROM envelopes'))!.n)>=10000)throw new RelayError(503,'Relay queue is full.')
      await tx.run('INSERT INTO dedupe VALUES (?,?,?,?)',e.id,e.senderId,digest,e.expiresAt+30*86400000)
      await tx.run('INSERT INTO envelopes VALUES (?,?,?,?,?,?,?,NULL,NULL)',e.id,e.senderId,e.recipientId,e.pairId,e.expiresAt,JSON.stringify(e),now)
      return 'queued'
    })
  }
  async inbox(recipient:string,now=Date.now()):Promise<Envelope[]> {
    return (await this.db.all('SELECT e.payload FROM envelopes e JOIN pairs p ON p.id=e.pair_id AND p.revoked=0 WHERE e.recipient=? AND e.expires_at>? ORDER BY e.queued_at DESC,e.id',recipient,now))
      .map(row=>JSON.parse(String(row.payload)) as Envelope)
  }
  async receipt(id:string,recipient:string,status:Exclude<Receipt,'queued'>,now=Date.now()) {
    await this.transaction(async tx=>{
      const row=await tx.get('SELECT e.received_at FROM envelopes e JOIN pairs p ON p.id=e.pair_id AND p.revoked=0 WHERE e.id=? AND e.recipient=? AND e.expires_at>?',id,recipient,now)
      if(!row)throw new RelayError(404,'Envelope unavailable.')
      if(status==='continued'&&row.received_at===null)throw new RelayError(409,'A received receipt is required first.')
      const column=status==='received'?'received_at':'continued_at'
      await tx.run(`UPDATE envelopes SET ${column}=COALESCE(${column},?) WHERE id=?`,now,id)
    })
  }
  async cleanup(now=Date.now()) {
    await this.transaction(async tx=>{
      for(const table of ['envelopes','dedupe','challenges','sessions','invitations'])await tx.run(`DELETE FROM ${table} WHERE expires_at<=?`,now)
    })
  }
  close() {return this.db.close()}
}
