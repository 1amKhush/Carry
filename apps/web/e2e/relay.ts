import { test as base, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

interface Relay { origin:string; directory:string; databasePath:string; restart:()=>Promise<void> }
export const test=base.extend<{relay:Relay}>({
  relay:async ({browserName},provide)=>{
    const directory=await mkdtemp(join(tmpdir(),'carry-e2e-'+browserName+'-'))
    const listener=createServer()
    listener.listen(0,'127.0.0.1');await once(listener,'listening')
    const port=(listener.address() as {port:number}).port
    await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()))
    const origin='http://127.0.0.1:'+port,databasePath=join(directory,'relay.sqlite')
    let child:ChildProcess|undefined
    async function start() {
      child=spawn(process.execPath,['src/server.ts'],{
        cwd:fileURLToPath(new URL('../../api/',import.meta.url)),
        // Always isolate browser tests from any exported production database/settings.
        env:{...process.env,TURSO_DATABASE_URL:undefined,TURSO_AUTH_TOKEN:undefined,RENDER:undefined,RENDER_EXTERNAL_URL:undefined,PORT:undefined,CARRY_API_PORT:String(port),CARRY_API_HOST:'127.0.0.1',CARRY_ORIGIN:origin,CARRY_SERVE_WEB:'1',CARRY_DB_PATH:databasePath},
        stdio:['ignore','pipe','pipe'],
      })
      await new Promise<void>((resolve,reject)=>{
        let output=''
        const timeout=setTimeout(()=>reject(new Error('Relay did not start: '+output)),15000)
        child!.on('error',error=>{clearTimeout(timeout);reject(error)})
        child!.on('exit',code=>{clearTimeout(timeout);reject(new Error('Relay exited '+code+': '+output))})
        child!.stderr!.on('data',data=>{output+=String(data)})
        child!.stdout!.on('data',data=>{output+=String(data);if(output.includes('Carry relay:')){clearTimeout(timeout);resolve()}})
      })
    }
    async function stop() {if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited}}
    try {await start();await provide({origin,directory,databasePath,restart:async()=>{await stop();await start()}})}
    finally {await stop();await rm(directory,{recursive:true,force:true})}
  },
})
export {expect}
