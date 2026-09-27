import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const proxy = {
  '/api': { target: `http://127.0.0.1:${process.env.CARRY_API_PORT ?? 3001}` },
}

export default defineConfig(({mode})=>{
  // A real Android share run is required before enabling this enhancement in production.
  const shareTarget=mode==='share-preview'||(process.env.VITE_ENABLE_SHARE_TARGET??loadEnv(mode,process.cwd(),'VITE_').VITE_ENABLE_SHARE_TARGET)==='1'
  return {
    plugins: [react(),{name:'carry-share-manifest',transformIndexHtml:html=>shareTarget?html.replace('href="/manifest.webmanifest"','href="/share-manifest.webmanifest"'):html}],
    define:{'import.meta.env.VITE_ENABLE_SHARE_TARGET':JSON.stringify(shareTarget?'1':'0')},
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', proxy },
  }
})
