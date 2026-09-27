import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RelayDatabase, SqlExecutor, SqlValue } from './database.ts'
import { schemaSql } from './schema.ts'

export class SqliteDatabase implements RelayDatabase {
  private connection: DatabaseSync
  private tail: Promise<unknown> = Promise.resolve()
  private executor: SqlExecutor

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700})
    this.connection = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path,0o600)
    const db = this.connection
    this.executor = {
      get: async (sql,...args) => db.prepare(sql).get(...args),
      all: async (sql,...args) => db.prepare(sql).all(...args),
      run: async (sql,...args) => ({changes:Number(db.prepare(sql).run(...args).changes)}),
    }
  }
  // Async route callbacks must never let another request enter this connection's transaction.
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action)
    this.tail = result.catch(()=>{})
    return result
  }
  initialize() {
    return this.exclusive(async () => {
      this.connection.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;')
      this.connection.exec(schemaSql)
    })
  }
  get(sql:string,...args:SqlValue[]) { return this.exclusive(()=>this.executor.get(sql,...args)) }
  all(sql:string,...args:SqlValue[]) { return this.exclusive(()=>this.executor.all(sql,...args)) }
  run(sql:string,...args:SqlValue[]) { return this.exclusive(()=>this.executor.run(sql,...args)) }
  transaction<T>(action:(tx:SqlExecutor)=>Promise<T>):Promise<T> {
    return this.exclusive(async () => {
      this.connection.exec('BEGIN IMMEDIATE')
      try {
        const result = await action(this.executor)
        this.connection.exec('COMMIT')
        return result
      } catch(error) {
        this.connection.exec('ROLLBACK')
        throw error
      }
    })
  }
  close() { return this.exclusive(async ()=>{this.connection.close()}) }
}
