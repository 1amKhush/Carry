import { chromium, type BrowserContext } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { test,expect } from '../e2e/relay.ts'

test('real toolbar action imports exact URL/title privately and rejects restricted tabs',async({relay},info)=>{
  const browserName=info.project.name,output=join(relay.directory,'extension-build')
  await promisify(execFile)('pnpm',['--filter','@carry/extension','exec','wxt','build','-b',browserName,'--level','error'],{
    cwd:fileURLToPath(new URL('../../..',import.meta.url)),
    env:{...process.env,WXT_CARRY_ORIGIN:relay.origin,CARRY_EXTENSION_OUT_DIR:output},
  })
  const extension=join(output,browserName+'-mv3')
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'))
  expect(manifest.permissions).toEqual(['activeTab'])
  expect(manifest.host_permissions).toBeUndefined()
  expect(manifest.content_scripts).toBeUndefined()
  const executablePath=browserName==='chrome'?process.env.CHROME_PATH:process.env.EDGE_PATH
  let context:BrowserContext|undefined
  try {
    // This debugging flag is limited to the disposable test profile. It is not
    // needed by users loading an unpacked extension from their browser's UI.
    context=await chromium.launchPersistentContext(join(relay.directory,'profile'),{
      ...(executablePath?{executablePath}:{channel:browserName==='chrome'?'chrome':'msedge'}),
      headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],
    })
    const cdp=await context.browser()!.newBrowserCDPSession()
    const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension})
    const worker=context.serviceWorkers().find(w=>w.url().includes(id))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().includes(id)})
    // Installation completes before the background script has registered its action.
    await expect.poll(()=>worker.evaluate('chrome.action.onClicked.hasListeners()')).toBe(true)
    const exact='https://example.com/capture?x=a%2Fb&literal=1+2#part%2fOne',title='Toolbar capture — exact title'
    await context.route('https://example.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<title>'+title+'</title><h1>Page to capture</h1>'}))
    const source=await context.newPage();await source.goto(exact);await source.bringToFront()
    const requests:{url:string;method:string;body:string}[]=[]
    context.on('request',request=>{if(request.url().startsWith(relay.origin))requests.push({url:request.url(),method:request.method(),body:request.postData()??''})})
    const tab=(await cdp.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos.find(target=>target.url===exact)!
    const opened=context.waitForEvent('page').catch(()=>null)
    await cdp.send('Extensions.triggerAction',{id,targetId:tab.targetId})
    const draft=await opened;expect(draft).not.toBeNull()
    await expect(draft!.locator('#primary')).toHaveValue(exact)
    await expect(draft!.locator('#title')).toHaveValue(title)
    expect(draft!.url()).toBe(relay.origin+'/#new')
    expect(requests.some(request=>request.url.endsWith('/api/v1/envelopes')&&request.method==='POST')).toBe(false)
    expect(JSON.stringify(requests)).not.toContain(exact)
    expect(JSON.stringify(requests)).not.toContain(title)
    const internal=await context.newPage();await internal.goto(browserName==='chrome'?'chrome://settings':'edge://settings');await internal.bringToFront()
    const restricted=(await cdp.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos.find(target=>target.url===internal.url())!
    const invalidOpened=context.waitForEvent('page').catch(()=>null)
    await cdp.send('Extensions.triggerAction',{id,targetId:restricted.targetId})
    const invalid=await invalidOpened;expect(invalid).not.toBeNull()
    await expect(invalid!.locator('.capture-error')).toBeVisible()
    await expect(invalid!.locator('#primary')).toHaveValue('')
    const db=new DatabaseSync(relay.databasePath,{readOnly:true})
    try {expect(Number(db.prepare('SELECT count(*) n FROM envelopes').get()!.n)).toBe(0)}finally{db.close()}
    console.log(browserName,context.browser()!.version(),'toolbar and restricted-page checks passed')
  } finally {await context?.close()}
})
