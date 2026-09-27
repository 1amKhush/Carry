export type SqlValue = string | number | bigint | null
export type SqlRow = Record<string, unknown>
export interface SqlExecutor {
  get(sql: string, ...args: SqlValue[]): Promise<SqlRow | undefined>
  all(sql: string, ...args: SqlValue[]): Promise<SqlRow[]>
  run(sql: string, ...args: SqlValue[]): Promise<{ changes: number }>
}
export interface RelayDatabase extends SqlExecutor {
  initialize(): Promise<void>
  transaction<T>(action: (tx: SqlExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}
