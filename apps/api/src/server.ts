import { createApp } from './app.ts'
import { runtimeConfig } from './config.ts'

const {port,host,...options}=runtimeConfig()
const app=createApp(options)
try {
  const address=await app.listen({host,port})
  console.log(`Carry relay: ${address}`)
} catch {
  console.error('Unable to start Carry relay. Check database access, schema permissions, origin, and port configuration.')
  await app.close()
  process.exit(1)
}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,async()=>{await app.close();process.exit(0)})
