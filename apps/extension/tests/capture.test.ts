import assert from 'node:assert/strict'
import test from 'node:test'
import { captureAddress, selectedTextAddress, selectedTextUrl, DEFAULT_CARRY_ORIGIN } from '../src/capture.ts'

test('toolbar capture puts only exact URL and title in the fragment',()=>{
  const input={url:'https://example.com/p?q=a%2Fb&x=1+2#exact',title:'Private page — title'}
  const address=new URL(captureAddress(input))
  assert.equal(address.origin,DEFAULT_CARRY_ORIGIN)
  assert.equal(address.pathname,'/')
  assert.equal(address.search,'')
  assert.deepEqual(JSON.parse(decodeURIComponent(address.hash.slice(9))),input)
})
test('restricted tabs and invalid schemes open a usable error draft; app origin stays constrained',()=>{
  for(const url of [undefined,'javascript:alert(1)','chrome://extensions','edge://settings','data:text/html,bad'])assert.equal(JSON.parse(decodeURIComponent(new URL(captureAddress({url})).hash.slice(9))).url,'')
  assert.throws(()=>captureAddress({url:'https://example.com'},'http://public.example'),/HTTPS/)
  assert.throws(()=>captureAddress({},DEFAULT_CARRY_ORIGIN+'/path'),/HTTPS/)
  assert.equal(new URL(captureAddress({},'http://127.0.0.1:5173')).origin,'http://127.0.0.1:5173')
})

test('selected-text action imports only a bounded explicit selection',()=>{
  const tab={url:'https://example.com/?x=a%2Fb#exact',title:'OAuth fix'}
  const selected=new URL(selectedTextAddress({editable:false,selectionText:'  Cookie state is missing.  '},tab))
  assert.deepEqual(JSON.parse(decodeURIComponent(selected.hash.slice(9))),{
    ...tab,url:tab.url+':~:text=Cookie%20state%20is%20missing.',excerpt:'Cookie state is missing.',
  })
  const tooLong=new URL(selectedTextAddress({editable:false,selectionText:'x'.repeat(5000)},tab))
  const longDraft=JSON.parse(decodeURIComponent(tooLong.hash.slice(9)))
  assert.equal(longDraft.excerpt.length,1201)
  assert.match(longDraft.url,/:~:text=/)
  assert.equal(new URL(selectedTextAddress({editable:true,selectionText:'password'},tab)).hash,'#capture-error=selection-editable')
  assert.equal(new URL(selectedTextAddress({editable:false,selectionText:' '},tab)).hash,'#capture-error=selection-empty')
})

test('selection links preserve query and anchor bytes, encode directives, and fall back for oversized URLs',()=>{
  const original='https://example.com/a%2fb?x=a%2Fb&literal=1+2#part%2fOne'
  assert.equal(selectedTextUrl(original,'State-cookie, 100% ready & safe.'),original+':~:text=State%2Dcookie%2C%20100%25%20ready%20%26%20safe.')
  assert.equal(selectedTextUrl(original,"Don't stop!"),original+':~:text=Don%27t%20stop%21')
  assert.equal(selectedTextUrl(original+':~:text=old','new target'),original+':~:text=new%20target')
  assert.equal(selectedTextUrl('https://example.com/path','single phrase'),'https://example.com/path#:~:text=single%20phrase')
  assert.equal(selectedTextUrl('javascript:alert(1)','selected'),null)
  assert.equal(selectedTextUrl(original,'  '),null)
  const passage='The state cookie is missing after the callback request. '+'Continue inspecting Safari headers. '.repeat(12)+'Finish at the last response header.'
  const longLink=selectedTextUrl(original,passage)!
  const directive=longLink.split(':~:text=')[1]
  assert.ok(directive)
  const [start,end]=directive.split(',').map(decodeURIComponent)
  assert.ok(start&&end)
  assert.ok(passage.startsWith(start))
  assert.ok(passage.endsWith(end))
  assert.match(passage[start.length]??'',/\s/)
  assert.match(passage[passage.length-end.length-1]??'',/\s/)
  const nearLimit='https://example.com/?q='+'a'.repeat(2010)
  assert.equal(selectedTextUrl(nearLimit,'highlight me'),null)
  const fallback=new URL(selectedTextAddress({editable:false,selectionText:'highlight me'},{url:nearLimit,title:'Long URL'}))
  assert.deepEqual(JSON.parse(decodeURIComponent(fallback.hash.slice(9))),{
    url:nearLimit,title:'Long URL',excerpt:'highlight me',selectionLinkUnavailable:true,
  })
})
