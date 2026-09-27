import { AxeBuilder } from '@axe-core/playwright'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { join } from 'node:path'
import { test,expect } from './relay.ts'

import { primary, send, navigate, pair, submit } from './helpers.ts'

test('persistent profiles pair; recipient closes; encrypted card survives API restart; exact Continue and receipts survive reload',async({page,relay})=>{
  const options={executablePath:process.env.CHROME_PATH,headless:true,viewport:page.viewportSize()!,reducedMotion:'reduce' as const}
  let sender:BrowserContext|undefined,receiver:BrowserContext|undefined
  const errors:string[]=[]
  try {
    sender=await chromium.launchPersistentContext(join(relay.directory,'sender'),options)
    receiver=await chromium.launchPersistentContext(join(relay.directory,'receiver'),options)
    let a=await sender.newPage(),b=await receiver.newPage()
    a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message))
    await pair(a,b,relay.origin)
    const stored=await b.evaluate(async()=>{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('carry-secure-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
      const identity=await new Promise<{signingPrivate:CryptoKey;agreementPrivate:CryptoKey}>((resolve,reject)=>{const r=db.transaction('identity').objectStore('identity').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
      db.close()
      return [identity.signingPrivate.extractable,identity.agreementPrivate.extractable]
    })
    expect(stored).toEqual([false,false])
    await receiver.close();receiver=undefined
    const destination='https://example.com/research?topic=carry%2Ftask&ref=17#comment-17'
    const posted:string[]=[]
    a.on('request',r=>{if(r.url().endsWith('/api/v1/envelopes')&&r.method()==='POST')posted.push(r.postData()!)})
    await navigate(a,'New card')
    await a.getByLabel('A note to your future self').fill('Private note: compare comment 17.')
    for(let n=1;n<=3;n++){await a.getByRole('button',{name:'Add a related link'}).click();await a.getByLabel('Related link '+n,{exact:true}).fill('https://example.com/reference-'+n)}
    await expect(a.getByRole('button',{name:'All three links added'})).toBeDisabled()
    await submit(a,destination,'Private browser handoff')
    expect(posted).toHaveLength(1)
    for(const secret of [destination,'Private browser handoff','Private note'])expect(posted[0]).not.toContain(secret)
    await sender.close();sender=undefined
    await relay.restart()
    receiver=await chromium.launchPersistentContext(join(relay.directory,'receiver'),options)
    await receiver.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Task resumed</h1>'}))
    b=await receiver.newPage();b.on('pageerror',e=>errors.push(e.message))
    await b.goto(relay.origin+'/#inbox')
    const card=b.locator('.inbox-card')
    await expect(card.getByRole('heading',{name:'Private browser handoff'})).toBeVisible()
    await expect(card.getByRole('link',{name:/^Related link:/})).toHaveCount(3)
    await expect(card.locator('.saved-note')).toContainText('Private note: compare comment 17.')
    await b.reload()
    await expect(card).toHaveCount(1)
    const [popup]=await Promise.all([b.waitForEvent('popup'),card.getByRole('link',{name:/^Continue to/}).click()])
    await popup.waitForLoadState()
    expect(popup.url()).toBe(destination)
    expect(await popup.evaluate(()=>window.opener===null)).toBe(true)
    sender=await chromium.launchPersistentContext(join(relay.directory,'sender'),options)
    a=await sender.newPage();a.on('pageerror',e=>errors.push(e.message))
    await a.goto(relay.origin)
    await expect(a.locator('.delivery-panel li strong')).toHaveText('Continued')
    await b.reload();await expect(card).toHaveCount(1)
    expect(errors).toEqual([])
  } finally {await sender?.close();await receiver?.close()}
})

test('polling receives cards; lost send response retries the identical envelope after reload; Unpair revokes delivery',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  try {
    const b=await receiver.newPage()
    await pair(page,b,relay.origin)
    await navigate(b,'Inbox')
    await navigate(page,'New card')
    // The relay commits, but the sender never sees that response or outbox confirmation.
    const posted:string[]=[]
    await page.route('**/api/v1/outbox',r=>r.abort())
    await page.route('**/api/v1/envelopes',async r=>{posted.push(r.request().postData()!);await r.fetch();await r.abort()})
    await primary(page).fill('https://example.com/retry?exact=1#part')
    await page.getByLabel('Give it a name').fill('Retry once')
    await send(page).click()
    await expect(page.locator('.editor .send-error')).toContainText('relay could not be reached')
    await expect(b.getByRole('heading',{name:'Retry once'})).toBeVisible()
    await expect(primary(page)).toHaveValue('https://example.com/retry?exact=1#part')
    await page.reload()
    await expect(page.getByRole('button',{name:'Retry saved send'})).toBeVisible()
    await page.unroute('**/api/v1/envelopes')
    page.on('request',r=>{if(r.url().endsWith('/api/v1/envelopes')&&r.method()==='POST')posted.push(r.postData()!)})
    const retried=page.waitForResponse(r=>r.url().endsWith('/api/v1/envelopes')&&r.request().method()==='POST')
    await page.getByRole('button',{name:'Retry saved send'}).click()
    expect((await retried).status()).toBe(201)
    await page.unroute('**/api/v1/outbox')
    await expect(page.locator('.delivery-panel li strong')).toHaveText('Received')
    expect(posted).toHaveLength(2)
    expect(posted[1]).toBe(posted[0])
    await b.reload();await expect(b.locator('.inbox-card')).toHaveCount(1)
    await navigate(b,'Pair device')
    await b.getByRole('button',{name:'Unpair',exact:true}).click()
    await expect(b.getByRole('region',{name:'Trusted devices'})).toContainText('No paired devices')
    await expect(send(page)).toBeDisabled()
    await navigate(b,'Inbox');await expect(b.locator('.inbox-card')).toHaveCount(0)
  } finally {await receiver.close()}
})

test('invalid URLs stay in the form; keyboard navigation, pairing and inbox are accessible',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  const scan=async(p:Page)=>(await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))
  try {
    const b=await receiver.newPage()
    await page.goto(relay.origin)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
    await pair(page,b,relay.origin)
    expect(await scan(page)).toEqual([])
    await navigate(page,'New card')
    await primary(page).fill('javascript:alert(1)')
    let posts=0
    page.on('request',r=>{if(r.url().endsWith('/api/v1/envelopes')&&r.method()==='POST')posts++})
    await send(page).click()
    await expect(page.locator('#primary-error')).toBeVisible()
    expect(posts).toBe(0)
    await primary(page).fill('https://example.com/good')
    await page.getByRole('button',{name:'Add a related link'}).click()
    await page.getByLabel('Related link 1',{exact:true}).fill('data:text/html,bad')
    await send(page).click()
    await expect(page.getByLabel('Related link 1',{exact:true})).toBeFocused()
    expect(posts).toBe(0)
    await page.getByRole('button',{name:'Remove related link 1'}).click()
    await expect(page.getByLabel('A note to your future self')).toBeVisible()
    await navigate(page,'Inbox');await navigate(page,'New card')
    await expect(primary(page)).toHaveValue('https://example.com/good')
    expect(await scan(page)).toEqual([])
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await submit(page,'https://example.com/'+'long-path-'.repeat(35),'<script>Plain text</script>')
    await navigate(b,'Inbox')
    await expect(b.getByRole('heading',{name:'<script>Plain text</script>'})).toBeVisible()
    expect(await scan(b)).toEqual([])
    expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  } finally {await receiver.close()}
})

test('altered invitations and ciphertext are rejected; clearing site data requires new pairing',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  try {
    const b=await receiver.newPage()
    await page.goto(relay.origin+'/#pair')
    await page.getByRole('button',{name:'Create invitation'}).click()
    const invitation=new URL(await page.getByLabel('Invitation link',{exact:true}).inputValue())
    const decoded=JSON.parse(Buffer.from(invitation.hash.slice(6),'base64url').toString('utf8'))
    decoded.signature='A'.repeat(86)
    invitation.hash='pair='+Buffer.from(JSON.stringify(decoded)).toString('base64url')
    let joined=0
    b.on('request',r=>{if(r.url().endsWith('/join'))joined++})
    await b.goto(invitation.href)
    await expect(b.getByRole('alert')).toContainText('Invalid or expired invitation.')
    expect(joined).toBe(0)
    await pair(page,b,relay.origin)
    let receipts=0
    b.on('request',r=>{if(r.url().endsWith('/receipt'))receipts++})
    await b.route('**/api/v1/inbox',async route=>{
      const response=await route.fetch(),body=await response.json()
      for(const envelope of body.envelopes)envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1)
      await route.fulfill({response,json:body})
    })
    await submit(page,'https://example.com/signed','Tamper protection')
    await navigate(b,'Inbox')
    await expect(b.getByRole('alert')).toContainText('could not be verified')
    await expect(b.locator('.inbox-card')).toHaveCount(0)
    expect(receipts).toBe(0)
    await b.unroute('**/api/v1/inbox')
    await b.getByRole('button',{name:'Refresh inbox'}).click()
    await expect(b.getByRole('heading',{name:'Tamper protection'})).toBeVisible()
    await expect(page.locator('.delivery-panel li strong')).toHaveText('Received')
    const cdp=await receiver.newCDPSession(b)
    await b.goto('about:blank')
    await cdp.send('Storage.clearDataForOrigin',{origin:relay.origin,storageTypes:'all'})
    await b.goto(relay.origin+'/#pair')
    await expect(b.getByRole('region',{name:'Trusted devices'})).toContainText('No paired devices')
    await navigate(b,'Inbox')
    await expect(b.locator('.inbox-card')).toHaveCount(0)
    await expect(b.getByRole('region',{name:'This device'})).toContainText('must pair this device again')
  } finally {await receiver.close()}
})

test('retrying the retained form after polling confirms a lost response does not create a second card',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  try {
    const b=await receiver.newPage()
    await pair(page,b,relay.origin)
    await navigate(page,'New card')
    const posted:string[]=[]
    page.on('request',r=>{if(r.url().endsWith('/api/v1/envelopes')&&r.method()==='POST')posted.push(r.postData()!)})
    await page.route('**/api/v1/envelopes',async route=>{await route.fetch();await route.abort()})
    await primary(page).fill('https://example.com/confirmed-retry')
    await page.getByLabel('Give it a name').fill('One form attempt')
    await send(page).click()
    await expect(page.locator('.editor .send-error')).toBeVisible()
    await expect(page.locator('.delivery-panel li strong')).toHaveText('Queued')
    await page.unroute('**/api/v1/envelopes')
    await send(page).click()
    await expect(page.locator('.notice')).toContainText('Queued.')
    expect(posted).toHaveLength(2)
    expect(posted[1]).toBe(posted[0])
    await navigate(b,'Inbox')
    await expect(b.locator('.inbox-card')).toHaveCount(1)
  } finally {await receiver.close()}
})
