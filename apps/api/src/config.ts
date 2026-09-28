import { TursoDatabase } from './store/turso.ts'

export function runtimeConfig(env:NodeJS.ProcessEnv=process.env) {
  const render=env.RENDER==='true'
  const url=env.TURSO_DATABASE_URL?.trim()
  const token=env.TURSO_AUTH_TOKEN?.trim()
  if(render&&(!url||!token))throw new Error('Render requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; local disk is not durable.')
  if(token&&!url)throw new Error('TURSO_DATABASE_URL is required when TURSO_AUTH_TOKEN is set.')
  const origin=env.CARRY_ORIGIN??env.RENDER_EXTERNAL_URL??'http://127.0.0.1:5173'
  if(render&&!origin.startsWith('https://'))throw new Error('Render requires an HTTPS CARRY_ORIGIN or RENDER_EXTERNAL_URL.')
  const port=Number(env.PORT??env.CARRY_API_PORT??3001)
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.')
  return {
    port,host:env.PORT?'0.0.0.0':env.CARRY_API_HOST??'127.0.0.1',
    origin,databasePath:env.CARRY_DB_PATH??'./data/carry.sqlite',
    freeAiKey:env.CARRY_OPENROUTER_FREE_KEY?.trim()||undefined,
    serveWeb:env.CARRY_SERVE_WEB==='1'||env.NODE_ENV==='production'||render,
    database:url?new TursoDatabase({url,authToken:token}):undefined,
  }
}
