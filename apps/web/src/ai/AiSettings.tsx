import { useEffect, useState } from 'react'
import { beginOpenRouterOAuth, clearOpenRouterNotice, disconnectOpenRouter, getOpenRouterKey, readOpenRouterNotice, saveOpenRouterKey } from './openrouter'

export function AiSettings() {
  const [connected,setConnected]=useState<boolean|null>(null)
  const [manualKey,setManualKey]=useState('')
  const [message,setMessage]=useState(readOpenRouterNotice)
  useEffect(()=>{
    let mounted=true
    clearOpenRouterNotice()
    void getOpenRouterKey().then(key=>{if(mounted)setConnected(Boolean(key))})
      .catch(()=>{if(mounted){setConnected(false);setMessage('Browser storage is unavailable on this device.')}})
    return ()=>{mounted=false}
  },[])
  async function save() {
    try {await saveOpenRouterKey(manualKey);setManualKey('');setConnected(true);setMessage('Your OpenRouter key is saved on this device. It will be available on every received card here.')}
    catch(error){setMessage(error instanceof Error?error.message:'Could not save the key.')}
  }
  async function disconnect() {
    try {await disconnectOpenRouter();setConnected(false);setMessage('Your OpenRouter key was removed from this device.')}
    catch{setMessage('Could not remove the key from browser storage.')}
  }
  return <section className="screen" aria-labelledby="ai-settings-heading">
    <div className="page-heading"><p className="eyebrow"><span/>OPTIONAL AI</p><h1 id="ai-settings-heading">AI settings<span className="accent">.</span></h1><p>Connect once on this device, then use your own key on any received card.</p></div>
    <div className="ai-assistant ai-settings-card">
      <h2>My OpenRouter account</h2><p>The key stays in this browser’s IndexedDB. Carry’s relay does not receive your personal key. Clearing this site’s data removes it.</p>
      {connected===null?<p role="status">Checking browser connection…</p>:connected?<div className="ai-connected"><span role="status">Connected on this device</span><button type="button" className="refresh-inbox" onClick={()=>void disconnect()}>Disconnect and remove key</button></div>
        :<><button type="button" className="button ai-open" onClick={()=>{void beginOpenRouterOAuth().catch(()=>setMessage('Could not start OpenRouter sign-in. Try manual key entry.'))}}>Connect OpenRouter</button>
          <div className="ai-manual"><label htmlFor="openrouter-key">Or enter your own OpenRouter API key</label><div className="ai-manual-row"><input id="openrouter-key" type="password" autoComplete="off" spellCheck={false} value={manualKey} onChange={event=>setManualKey(event.target.value)} placeholder="sk-or-…"/><button type="button" className="refresh-inbox" onClick={()=>void save()} disabled={!manualKey.trim()}>Save key</button></div></div></>}
      {message&&<p className="ai-message" role="status">{message}</p>}
      <p>Free assistance uses Carry’s shared server key and does not need this connection. You choose which route to use on each card.</p>
      <a className="resume-back" href="#inbox">← Back to Inbox</a>
    </div>
  </section>
}
