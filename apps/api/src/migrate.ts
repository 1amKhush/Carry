import { TursoDatabase } from './store/turso.ts'

const url=process.env.TURSO_DATABASE_URL
if(!url)throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the API environment.')
const database=new TursoDatabase({url,authToken:process.env.TURSO_AUTH_TOKEN})
try {
  await database.initialize()
  const tables=await database.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  console.log('Carry schema ready:',tables.map(row=>row.name).join(', '))
} catch {
  console.error('Schema setup failed. Check Turso connectivity and the API database credentials.')
  process.exitCode=1
} finally {await database.close()}
