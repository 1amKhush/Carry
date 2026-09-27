import { expect, type Page } from '@playwright/test'
export const primary=(p:Page)=>p.getByRole('textbox',{name:'Primary link Required',exact:true})
export const send=(p:Page)=>p.getByRole('button',{name:'Send card',exact:true})
export async function navigate(p:Page,name:string){await p.getByRole('navigation').getByRole('link',{name,exact:true}).click()}
export async function pair(a:Page,b:Page,origin:string) {
  await a.goto(origin+'/#pair')
  const previous=await a.getByLabel('Invitation link',{exact:true}).inputValue({timeout:200}).catch(()=>'')
  await a.getByRole('button',{name:'Create invitation'}).click()
  await expect(a.getByLabel('Invitation link',{exact:true})).not.toHaveValue(previous)
  const invitation=await a.getByLabel('Invitation link',{exact:true}).inputValue()
  await expect(a.getByRole('img',{name:'Scan this QR invitation on your other device'})).toBeVisible()
  await b.goto(invitation)
  await expect(b.getByLabel('Verification code')).toBeVisible()
  await expect(a.getByLabel('Verification code')).toHaveText(await b.getByLabel('Verification code').innerText())
  await a.getByRole('button',{name:'Codes match — Approve'}).click()
  await expect(a.getByRole('button',{name:/Approved here/})).toBeDisabled()
  await expect(a.getByRole('region',{name:'Trusted devices'}).getByRole('button',{name:'Unpair'})).toHaveCount(0)
  await b.getByRole('button',{name:'Codes match — Approve'}).click()
  await expect(a.getByRole('region',{name:'Trusted devices'}).getByRole('button',{name:'Unpair'})).toBeVisible()
  await expect(b.getByRole('region',{name:'Trusted devices'}).getByRole('button',{name:'Unpair'})).toBeVisible()
}
export async function submit(p:Page,url:string,title:string) {
  await navigate(p,'New card')
  await primary(p).fill(url)
  await p.getByLabel('Give it a name').fill(title)
  await send(p).click()
  await expect(p.locator('.notice')).toContainText('Queued.')
}
