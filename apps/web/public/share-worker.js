// This worker handles only a share POST. It never forwards its body or caches API data.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())})
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())})
function saveShare(input) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('carry-capture-v1',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'id'})
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending')
      const id=crypto.randomUUID(),now=Date.now(),all=store.getAll()
      all.onsuccess=()=>{
        const current=all.result.filter(item=>item.createdAt>now-86400000)
        for(const item of all.result)if(item.createdAt<=now-86400000)store.delete(item.id)
        if(current.length>=20){tx.abort();return}
        store.add({id,createdAt:now,input})
      }
      tx.oncomplete=()=>{db.close();resolve(id)}
      tx.onabort=()=>{db.close();reject(tx.error??new Error('Shared draft storage is full.'))}
      tx.onerror=()=>{db.close();reject(tx.error)}
    }
  })
}
async function receiveShare(request) {
  try {
    // Bound input before parsing; do not accept files or unbounded share bodies.
    const reader=request.body?.getReader(),chunks=[]
    let size=0
    if(!reader)throw new Error('Missing share data')
    while(true) {
      const {value,done}=await reader.read()
      if(done)break
      size+=value.byteLength
      if(size>32768){await reader.cancel();throw new Error('Share too large')}
      chunks.push(value)
    }
    const data=await new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('Content-Type')??''}}).formData()
    const input={}
    for(const key of ['url','title','text']) {
      const value=data.get(key)??''
      if(typeof value!=='string'||value.length>8192)throw new Error('Invalid share input')
      input[key]=value
    }
    for(const value of data.values())if(typeof value!=='string')throw new Error('Files are not supported')
    const id=await saveShare(input)
    return Response.redirect(new URL('/#share='+id,self.location.origin).href,303)
  } catch {
    return Response.redirect(new URL('/#capture-error=share-unavailable',self.location.origin).href,303)
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(url.origin===self.location.origin&&url.pathname==='/share-target'&&event.request.method==='POST')event.respondWith(receiveShare(event.request))
})
