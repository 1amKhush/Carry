export function DevicePanel({ready,error}:{ready:boolean;error:string}) {
  return <section className="device-panel" aria-label="This device">
    <h2>This device · {ready?'Keys saved in this browser':'Preparing keys…'}</h2>
    <p>Clearing this browser profile’s site data loses its keys. You must pair this device again.</p>
    <p>Browser encryption protects stored relay data. The code served to your browser still needs careful security review.</p>
    {error&&<p className="send-error" role="alert">{error}</p>}
  </section>
}
