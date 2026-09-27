import { readFileSync } from 'node:fs'

export const schemaSql = readFileSync(new URL('./schema.sql',import.meta.url),'utf8')
export const schemaStatements = schemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)
