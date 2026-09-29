import { test, expect } from './relay.ts'
import { navigate, pair, primary, send } from './helpers.ts'

const destination='https://example.com/fix?state=a%2Fb#comment-17'
const dummyKey='sk-or-test000000000000000000000000000000'
const plan={whereYouLeftOff:'You were fixing a Safari callback.',doNext:['Check the state cookie.'],usefulLinks:[{label:'Original page',url:destination}],insufficientContext:false}

async function sendCard(sender:import('@playwright/test').Page,title='OAuth callback') {
  await navigate(sender,'New card')
  await primary(sender).fill(destination)
  await sender.getByLabel('Give it a name').fill(title)
  await sender.getByLabel('Goal').fill('Fix the callback')
  await sender.getByLabel('Next action').fill('Check Safari cookies')
  await send(sender).click()
  await expect(sender.locator('.notice')).toContainText('Queued')
}

test('free help needs approval, discloses the Carry API hop, and keeps Continue available',async({page,browser,relay})=>{
  const receiver=await browser.newContext(),b=await receiver.newPage()
  const freeRequests:{body:string;authorization:string}[]=[]
  let externalCalls=0
  try {
    await pair(page,b,relay.origin)
    await sendCard(page)
    await b.route('**/api/v1/ai/free/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,perDeviceDailyLimit:5,remainingPlans:5,remainingAttempts:12,sharedCapacityAvailable:true})}))
    await b.route('**/api/v1/ai/free',route=>{
      freeRequests.push({body:route.request().postData()??'',authorization:route.request().headers().authorization??''})
      return route.fulfill({contentType:'application/json',body:JSON.stringify({content:JSON.stringify(plan),model:'vendor/example:free'})})
    })
    b.on('request',request=>{if(request.url().startsWith('https://openrouter.ai/'))externalCalls++})
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume OAuth callback'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await expect(b.getByLabel('Use')).toHaveValue('free')
    await expect(b.getByText(/pass through Carry’s API/)).toBeVisible()
    await expect(b.getByLabel('Exact card data for OpenRouter')).toContainText(destination)
    expect(freeRequests).toHaveLength(0)
    await b.getByRole('button',{name:'Approve and ask AI'}).click()
    await expect(b.getByRole('region',{name:'AI resume plan'})).toContainText('Check the state cookie.')
    expect(freeRequests).toHaveLength(1)
    expect(freeRequests[0].authorization).toMatch(/^Bearer /)
    expect(JSON.parse(freeRequests[0].body).input).toEqual(JSON.parse(await b.getByLabel('Exact card data for OpenRouter').innerText()))
    expect(freeRequests[0].body).not.toContain(dummyKey)
    expect(externalCalls).toBe(0)
    await expect(b.getByRole('link',{name:/^Continue to/})).toHaveAttribute('href',destination)
  } finally {await receiver.close()}
})

test('exhausted free allowance is explained before approval while Continue still works',async({page,browser,relay})=>{
  const receiver=await browser.newContext(),b=await receiver.newPage()
  try {
    await pair(page,b,relay.origin)
    await sendCard(page)
    let remainingPlans=0
    await b.route('**/api/v1/ai/free/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,perDeviceDailyLimit:5,remainingPlans,remainingAttempts:9,sharedCapacityAvailable:true})}))
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume OAuth callback'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await expect(b.getByText(/used your five free plans/)).toBeVisible()
    await expect(b.getByRole('button',{name:'Approve and ask AI'})).toBeDisabled()
    await expect(b.getByRole('link',{name:/^Continue to/})).toHaveAttribute('href',destination)
    remainingPlans=5
    await b.getByRole('button',{name:'Refresh allowance'}).click()
    await expect(b.getByText(/5 of 5 free plans left/)).toBeVisible()
    await expect(b.getByRole('button',{name:'Approve and ask AI'})).toBeEnabled()
  } finally {await receiver.close()}
})

test('one saved personal key serves multiple cards; only explicit model selection can use another model',async({page,browser,relay})=>{
  const receiver=await browser.newContext(),b=await receiver.newPage()
  const aiRequests:{body:string;authorization:string}[]=[]
  try {
    await pair(page,b,relay.origin)
    await sendCard(page,'First task')
    await sendCard(page,'Second task')
    await navigate(b,'AI settings')
    await b.getByLabel('Or enter your own OpenRouter API key').fill(dummyKey)
    await b.getByRole('button',{name:'Save key'}).click()
    await expect(b.getByText('Connected on this device',{exact:true})).toBeVisible()
    await b.route('https://openrouter.ai/api/v1/chat/completions',route=>{
      aiRequests.push({body:route.request().postData()??'',authorization:route.request().headers().authorization??''})
      return route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]})})
    })
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume First task'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await b.getByLabel('Use').selectOption('own')
    expect(aiRequests).toHaveLength(0)
    await b.getByRole('button',{name:'Approve and ask AI'}).click()
    await expect(b.getByRole('region',{name:'AI resume plan'})).toBeVisible()
    expect(JSON.parse(aiRequests[0].body).model).toBe('openrouter/free')
    await b.getByRole('link',{name:'Back to Inbox'}).click()
    await b.getByRole('link',{name:'Resume Second task'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await b.getByLabel('Use').selectOption('own')
    await b.getByLabel('Model for my account').selectOption('other')
    await b.getByLabel('OpenRouter model ID').fill('openai/gpt-4o-mini')
    expect(aiRequests).toHaveLength(1)
    await b.getByRole('button',{name:'Approve and ask AI'}).click()
    await expect(b.getByRole('region',{name:'AI resume plan'})).toBeVisible()
    expect(JSON.parse(aiRequests[1].body).model).toBe('openai/gpt-4o-mini')
    expect(aiRequests.every(item=>item.authorization==='Bearer '+dummyKey)).toBe(true)
    await navigate(b,'AI settings')
    await b.getByRole('button',{name:'Disconnect and remove key'}).click()
    await expect(b.getByLabel('Or enter your own OpenRouter API key')).toBeVisible()
    await b.reload()
    await expect(b.getByLabel('Or enter your own OpenRouter API key')).toBeVisible()
  } finally {await receiver.close()}
})

test('free limits and bad personal-model output leave the card usable',async({page,browser,relay})=>{
  const receiver=await browser.newContext(),b=await receiver.newPage()
  try {
    await pair(page,b,relay.origin)
    await sendCard(page)
    await b.route('**/api/v1/ai/free/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,perDeviceDailyLimit:5,remainingPlans:5,remainingAttempts:12,sharedCapacityAvailable:true})}))
    await b.route('**/api/v1/ai/free',route=>route.fulfill({status:429,contentType:'application/json',body:'{"error":"Free models are busy. Try again later."}'}))
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume OAuth callback'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await b.getByRole('button',{name:'Approve and ask AI'}).click()
    await expect(b.getByText(/Free models are busy/)).toBeVisible()
    await expect(b.getByRole('link',{name:/^Continue to/})).toHaveAttribute('href',destination)
    await navigate(b,'AI settings')
    await b.getByLabel('Or enter your own OpenRouter API key').fill(dummyKey)
    await b.getByRole('button',{name:'Save key'}).click()
    await b.route('https://openrouter.ai/api/v1/chat/completions',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'{}'}}]})}))
    await navigate(b,'Inbox')
    await b.getByRole('link',{name:'Resume OAuth callback'}).click()
    await b.getByRole('button',{name:'Help me resume'}).click()
    await b.getByLabel('Use').selectOption('own')
    await b.getByRole('button',{name:'Approve and ask AI'}).click()
    await expect(b.getByText(/invalid plan/)).toBeVisible()
    await expect(b.getByRole('link',{name:/^Continue to/})).toHaveAttribute('href',destination)
  } finally {await receiver.close()}
})

test('PKCE in the one-time key setting scrubs callback codes and rejects a forged callback',async({page,relay})=>{
  let challenge='',exchanges=0
  let exchange:{code:string;code_verifier:string;code_challenge_method:string}|undefined
  await page.goto(relay.origin+'/#settings')
  await page.route('https://openrouter.ai/auth?*',route=>{
    const authorization=new URL(route.request().url())
    challenge=authorization.searchParams.get('code_challenge')??''
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    const callback=new URL(authorization.searchParams.get('callback_url')!)
    callback.searchParams.set('code','mock-authorization-code')
    return route.fulfill({status:302,headers:{Location:callback.href},body:''})
  })
  await page.route('https://openrouter.ai/api/v1/auth/keys',route=>{
    exchanges++
    exchange=route.request().postDataJSON()
    return route.fulfill({contentType:'application/json',body:JSON.stringify({key:dummyKey})})
  })
  await page.getByRole('button',{name:'Connect OpenRouter',exact:true}).click()
  await expect(page).toHaveURL(relay.origin+'/#settings')
  await expect(page.getByText('Connected on this device',{exact:true})).toBeVisible()
  expect(page.url()).not.toContain('mock-authorization-code')
  expect(exchange?.code).toBe('mock-authorization-code')
  const expected=await page.evaluate(async verifier=>{
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  },exchange!.code_verifier)
  expect(challenge).toBe(expected)
  await page.goto(relay.origin+'/oauth/openrouter?state=forged&code=forged-code')
  await expect(page).toHaveURL(relay.origin+'/#inbox')
  expect(exchanges).toBe(1)
})
