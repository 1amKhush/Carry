import { useCallback, useEffect, useRef, useState } from 'react'
import type { Identity } from '@carry/crypto'
import type { Pair } from '@carry/protocol/secure'
import { getIdentity } from './lib/device'
import { trustedPeers } from './lib/pairing'
import { DevicePanel } from './DevicePanel'
import { PairDevices } from './PairDevices'
import { Outbox } from './Outbox'
import { Icon } from './Icon'
import { Inbox } from './Inbox'
import { NewCard } from './NewCard'
import { readCaptureLocation, type CaptureRequest } from './capture/importDraft'
import './App.css'

function currentScreen() {return location.hash.startsWith('#pair')?'pair':location.hash==='#inbox'?'inbox':'new'}
export default function App({initialCapture=null}:{initialCapture?:CaptureRequest|null}) {
  const [capture,setCapture]=useState(initialCapture)
  const [screen,setScreen]=useState(currentScreen)
  const [identity,setIdentity]=useState<Identity|null>(null)
  const [peers,setPeers]=useState<Pair[]>([])
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const mainRef=useRef<HTMLElement>(null)
  const refreshPeers=useCallback(()=>{
    void trustedPeers().then(result=>{setPeers(result);setError('')}).catch(error=>setError(error instanceof Error?error.message:'Could not connect to the relay.'))
  },[])
  useEffect(()=>{
    void getIdentity().then(result=>{setIdentity(result);refreshPeers()}).catch(error=>setError(error instanceof Error?error.message:'Browser storage is unavailable. Enable it and reload.'))
    const interval=setInterval(refreshPeers,5000)
    return ()=>clearInterval(interval)
  },[refreshPeers])
  useEffect(()=>{
    function navigate(){
      void readCaptureLocation().then(request=>{if(request){setCapture(request);setScreen('new')}})
      setScreen(currentScreen());setNotice('');mainRef.current?.focus()
    }
    window.addEventListener('hashchange',navigate)
    return ()=>window.removeEventListener('hashchange',navigate)
  },[])
  const title=screen==='new'?'New card':screen==='pair'?'Pair device':'Inbox'
  useEffect(()=>{document.title=title+' · Carry'},[title])
  return <div className="app-shell">
    <a className="skip-link" href="#main" onClick={e=>{e.preventDefault();mainRef.current?.focus()}}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#new" aria-label="Carry home"><span className="brand-mark" aria-hidden="true"><Icon name="arrow"/></span>carry<span className="brand-period">.</span></a>
      <p className="brand-caption">Keep your train of thought.</p>
      <nav aria-label="Main navigation"><p className="nav-label">YOUR SPACE</p>
        {([{id:'new',label:'New card',icon:'plus'},{id:'inbox',label:'Inbox',icon:'inbox'},{id:'pair',label:'Pair device',icon:'link'}] as const).map(item=><a key={item.id} className={'nav-link '+(screen===item.id?'active':'')} href={'#'+item.id} aria-current={screen===item.id?'page':undefined}><Icon name={item.icon}/><span>{item.label}</span></a>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-sketch" aria-hidden="true"><span/><span/><Icon name="arrow"/></div><p>A small card.<br/>A clear place to return.</p><div className="session-info"><span className="status-dot"/>Private handoff</div><p className="session-explanation">Encrypted before sending.<br/>Kept for seven days.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><p>My workspace <span aria-hidden="true">/</span><strong>{title}</strong></p><span className="preview-badge"><span className="status-dot"/>Private handoff</span></header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <DevicePanel ready={Boolean(identity)} error={error}/>
        <div className="notice" role="status">{notice&&<><Icon name="check"/>{notice}</>}</div>
        {identity&&<>
          <div hidden={screen!=='new'}><NewCard capture={capture} deviceId={identity.public.id} peers={peers} onNotice={setNotice}/>{screen==='new'&&<Outbox/>}</div>
          {screen==='inbox'&&<Inbox/>}
          {screen==='pair'&&<PairDevices deviceId={identity.public.id} peers={peers} onChange={refreshPeers}/>}
        </>}
      </main>
      <footer className="workspace-footer"><span>A little context goes a long way.</span><span>CARRY / PRIVATE HANDOFF 03</span></footer>
    </div>
  </div>
}
