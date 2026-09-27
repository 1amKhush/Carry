import { createClient, type Client, type Transaction } from '@libsql/client'
import type { RelayDatabase, SqlExecutor, SqlValue } from './database.ts'
import { schemaStatements } from './schema.ts'

function executor(connection: Pick<Client | Transaction,'execute'>): SqlExecutor {
  return {
    get: async (sql,...args) => (await connection.execute({sql,args})).rows[0],
    all: async (sql,...args) => (await connection.execute({sql,args})).rows,
    run: async (sql,...args) => ({changes:(await connection.execute({sql,args})).rowsAffected}),
  }
}
export class TursoDatabase implements RelayDatabase {
  private client: Client
  private executor: SqlExecutor
  constructor(options:{url:string;authToken?:string}) {
    const url = new URL(options.url)
    const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    if (!['libsql:','https:'].includes(url.protocol) && !(url.protocol==='http:'&&local)) throw new Error('Turso requires a libsql:// or HTTPS URL.')
    if (url.username || url.password || url.search || url.hash) throw new Error('Use a plain Turso URL; supply credentials only through TURSO_AUTH_TOKEN.')
    if (!local && !options.authToken) throw new Error('TURSO_AUTH_TOKEN is required.')
    this.client = createClient(options)
    this.executor = executor(this.client)
  }
  async initialize() { await this.client.batch(schemaStatements,'write') }
  get(sql:string,...args:SqlValue[]) { return this.executor.get(sql,...args) }
  all(sql:string,...args:SqlValue[]) { return this.executor.all(sql,...args) }
  run(sql:string,...args:SqlValue[]) { return this.executor.run(sql,...args) }
  async transaction<T>(action:(tx:SqlExecutor)=>Promise<T>):Promise<T> {
    const tx = await this.client.transaction('write')
    try {
      const result = await action(executor(tx))
      await tx.commit()
      return result
    } catch(error) {
      await tx.rollback().catch(()=>{})
      throw error
    } finally { tx.close() }
  }
  async close() { this.client.close() }
}
