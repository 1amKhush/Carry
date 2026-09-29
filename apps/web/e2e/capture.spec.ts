import { DatabaseSync } from 'node:sqlite'
import { test,expect } from './relay.ts'
import { primary,send,navigate,pair } from './helpers.ts'
const exact='https://example.com/capture?x=a%2Fb&literal=1+2&repeat=1&repeat=2#part%2fOne'
const excerpt='Selected detail: the state cookie is missing on Safari.'
const fragment=(input:unknown)=>'#capture='+encodeURIComponent(JSON.stringify(input))
function queued(path:string) {const db=new DatabaseSync(path,{readOnly:true});try{return Number(db.prepare('SELECT count(*) n FROM envelopes').get()!.n)}finally{db.close()}}
async function share(page:import('@playwright/test').Page,input:Record<string,string>,action='/share-target',controlled=true) {
  if(controlled)await page.evaluate(async()=>{
    await navigator.serviceWorker.ready
    if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}))
  })
  await page.evaluate(({input,action})=>{
    const form=document.createElement('form');form.method='POST';form.action=action;form.enctype='multipart/form-data'
    for(const [name,value] of Object.entries(input)){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.append(field)}
    document.body.append(form);form.submit()
  },{input,action})
  await expect(page).toHaveURL(/#new$/)
}

test('capture is only a retained draft until Send; exact URL survives encrypted delivery and Continue',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  try {
    const b=await receiver.newPage();await pair(page,b,relay.origin)
    const network:string[]=[]
    page.on('request',request=>network.push(request.url()+' '+(request.postData()??'')))
    await page.goto(relay.origin+'/'+fragment({url:exact,title:'Captured page — review me',excerpt}))
    await expect(primary(page)).toHaveValue(exact)
    await expect(page.getByLabel('Give it a name')).toHaveValue('Captured page — review me')
    await expect(page.getByLabel('Relevant detail')).toHaveValue(excerpt)
    await expect(page.getByRole('complementary',{name:'Live card preview'})).toContainText('Captured page — review me')
    expect(page.url()).toBe(relay.origin+'/#new')
    expect(queued(relay.databasePath)).toBe(0)
    expect(network.join(' ')).not.toContain(exact)
    expect(network.join(' ')).not.toContain(excerpt)
    await page.getByLabel('A note to your future self').fill('Review before sending')
    await navigate(page,'Inbox');await navigate(page,'New card');await page.reload()
    await expect(primary(page)).toHaveValue(exact)
    await expect(page.getByLabel('A note to your future self')).toHaveValue('Review before sending')
    await expect(page.getByLabel('Relevant detail')).toHaveValue(excerpt)
    await page.route('**/api/v1/envelopes',route=>route.abort())
    await send(page).click()
    await expect(page.locator('.editor .send-error')).toBeVisible()
    expect(queued(relay.databasePath)).toBe(0)
    await page.reload();await expect(primary(page)).toHaveValue(exact)
    await page.unroute('**/api/v1/envelopes')
    await send(page).click();await expect(page.locator('.notice')).toContainText('Queued')
    expect(queued(relay.databasePath)).toBe(1)
    await navigate(b,'Inbox')
    await expect(b.getByRole('heading',{name:'Captured page — review me'})).toBeVisible()
    await b.getByRole('link',{name:'Resume Captured page — review me'}).click()
    await expect(b.getByRole('heading',{name:'Continue where you left off.'})).toBeVisible()
    await expect(b.locator('.resume-excerpt')).toContainText(excerpt)
    await receiver.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'Resumed'}))
    const [popup]=await Promise.all([b.waitForEvent('popup'),b.getByRole('link',{name:/^Continue to/}).click()])
    await popup.waitForLoadState();expect(popup.url()).toBe(exact)
  } finally {await receiver.close()}
})

test('selected-text Continue opens the highlighted passage after encrypted delivery',async({page,browser,relay})=>{
  const receiver=await browser.newContext({viewport:page.viewportSize()!})
  try {
    const b=await receiver.newPage()
    await pair(page,b,relay.origin)
    const selected='The state cookie is missing on Safari.'
    const deepLink='https://example.com/article?x=a%2Fb&repeat=1&repeat=2#part%2fOne:~:text='+encodeURIComponent(selected)
    await page.goto(relay.origin+'/'+fragment({url:deepLink,title:'Selected passage',excerpt:selected}))
    await expect(primary(page)).toHaveValue(deepLink)
    await expect(page.getByText(/Selected passage link/)).toBeVisible()
    await expect(page.getByLabel('Relevant detail')).toHaveValue(selected)
    expect(queued(relay.databasePath)).toBe(0)
    await send(page).click()
    await expect(page.locator('.notice')).toContainText('Queued')
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume Selected passage'}).click()
    await expect(b.getByText(/Selected passage link/)).toBeVisible()
    const continueLink=b.getByRole('link',{name:/^Continue to/})
    await expect(continueLink).toHaveAttribute('href',deepLink)
    await receiver.route('https://example.com/**',route=>route.fulfill({
      contentType:'text/html; charset=utf-8',
      body:'<title>Article</title><h1 id="part/One">Original page anchor</h1><div style="height:1400px"></div><p>'+selected+'</p><div style="height:1400px"></div>',
    }))
    const [popup]=await Promise.all([b.waitForEvent('popup'),continueLink.click()])
    await popup.waitForLoadState()
    await expect.poll(()=>popup.evaluate(()=>scrollY)).toBeGreaterThan(500)
  } finally {await receiver.close()}
})

test('a new capture cannot silently replace existing work, and invalid captures leave a usable editor',async({page,relay})=>{
  await page.goto(relay.origin)
  await primary(page).fill('https://example.com/current')
  await page.getByLabel('A note to your future self').fill('Keep this context')
  await page.goto(relay.origin+'/'+fragment({url:exact,title:'Replacement'}))
  await expect(page.getByRole('region',{name:'New captured page'})).toBeVisible()
  await page.getByRole('button',{name:'Keep current draft'}).click()
  await expect(primary(page)).toHaveValue('https://example.com/current')
  await page.goto(relay.origin+'/'+fragment({url:exact,title:'Replacement'}))
  await page.getByRole('button',{name:'Use captured page'}).click()
  await expect(primary(page)).toHaveValue(exact)
  await expect(page.getByLabel('A note to your future self')).toHaveValue('Keep this context')
  for(const hash of [fragment({url:'javascript:alert(1)'}),'#capture=%broken',fragment({}),'#capture-error=selection-editable']) {
    await page.goto(relay.origin+'/'+hash)
    await expect(page.locator('.capture-error')).toBeVisible()
    await expect(primary(page)).toHaveValue(exact)
    expect(page.url()).toBe(relay.origin+'/#new')
  }
  await primary(page).fill('https://example.com/manual')
  expect(queued(relay.databasePath)).toBe(0)
})

test('controlled POST shares stay in the worker, normalize text URLs, and enter the same editor',async({page,relay})=>{
  await page.goto(relay.origin)
  await expect(primary(page)).toBeVisible()
  const manifest=await (await page.request.get(relay.origin+'/share-manifest.webmanifest')).json()
  expect(manifest.share_target.method).toBe('POST')
  let serverPosts=0
  // Service-worker-owned responses never reach the HTTP server. The temporary relay
  // counts requests below through its test-only request counter.
  const fallback=await page.request.post(relay.origin+'/share-target',{form:{url:'https://example.com/fallback-fixture'},maxRedirects:0})
  expect(fallback.status()).toBe(303)
  expect(fallback.headers().location).toBe('/#capture-error=share-unavailable')
  expect(relay.sharePosts()).toBe(1)
  const before=relay.sharePosts()
  page.on('response',response=>{if(response.url().endsWith('/share-target')){expect(response.fromServiceWorker()).toBe(true);serverPosts++}})
  await share(page,{text:'Read this page\n'+exact,title:'Shared from a browser'})
  await expect(primary(page)).toHaveValue(exact)
  await expect(page.getByLabel('Give it a name')).toHaveValue('Shared from a browser')
  expect(relay.sharePosts()).toBe(before)
  expect(serverPosts).toBeGreaterThan(0)
  expect(queued(relay.databasePath)).toBe(0)
  await page.reload();await expect(primary(page)).toHaveValue(exact)
  await share(page,{url:'javascript:alert(1)',title:'Invalid share'})
  await expect(page.locator('.capture-error')).toBeVisible()
  await expect(primary(page)).toHaveValue(exact)
  expect(relay.sharePosts()).toBe(before)
  expect(queued(relay.databasePath)).toBe(0)
})

// This is still a browser simulation, not an Android system-share acceptance run.
test('a stopped share worker wakes for navigation from outside the app after its window closes',async({page,relay})=>{
  await page.goto(relay.origin)
  await expect(primary(page)).toBeVisible()
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true))
  const source=await page.context().newPage()
  await source.route('http://localhost:9998/**',route=>route.fulfill({contentType:'text/html',body:'<title>A browser sharing a page</title><p>Share this link</p>'}))
  await source.goto('http://localhost:9998/source')
  await page.close()
  const cdp=await source.context().newCDPSession(source)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')
  await share(source,{url:exact,title:'Shared with Carry closed'},relay.origin+'/share-target',false)
  await expect(primary(source)).toHaveValue(exact)
  await expect(source.getByLabel('Give it a name')).toHaveValue('Shared with Carry closed')
  expect(relay.sharePosts()).toBe(0)
  expect(queued(relay.databasePath)).toBe(0)
})
