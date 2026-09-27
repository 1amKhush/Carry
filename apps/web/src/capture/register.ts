export async function registerShareWorker():Promise<void> {
  if(import.meta.env.VITE_ENABLE_SHARE_TARGET!=='1')return
  if(!window.isSecureContext||!('serviceWorker' in navigator))return
  try {await navigator.serviceWorker.register('/share-worker.js',{scope:'/',updateViaCache:'none'})}
  catch { /* Manual paste and the extension remain usable without system sharing. */ }
}
