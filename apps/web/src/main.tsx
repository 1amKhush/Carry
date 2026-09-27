import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { readCaptureLocation } from './capture/importDraft'
import { registerShareWorker } from './capture/register'
import { finishOpenRouterOAuth } from './ai/openrouter'

await finishOpenRouterOAuth()
const capture=await readCaptureLocation()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialCapture={capture}/>
  </StrictMode>,
)
void registerShareWorker()
