import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCapture } from '../src/capture/normalize.ts'
import { parseExactHttpUrl } from '@carry/protocol'

const url='https://example.com/a%2fb?x=a%2Fb&repeat=1&repeat=2+3#part%2fOne'
test('capture preserves exact URL bytes and title; no card ID, recipient or send is created',()=>{
  const result=normalizeCapture({url,title:'A page — context'})
  assert.ok('draft' in result)
  assert.deepEqual(result.draft,{url,title:'A page — context'})
  assert.equal(parseExactHttpUrl('HTTPS://EXAMPLE.COM:443/a/../b?x=%2f#Part'),'HTTPS://EXAMPLE.COM:443/a/../b?x=%2f#Part')
})
test('Android text links normalize through the same contract; explicit URL wins',()=>{
  for(const text of [url,'Read this page\n'+url]) {
    const result=normalizeCapture({text,title:'Shared page'})
    assert.ok('draft' in result)
    assert.equal(result.draft.url,url)
  }
  const result=normalizeCapture({url,text:'https://other.example',title:''})
  assert.ok('draft' in result)
  assert.equal(result.draft.url,url)
})
test('missing, malformed, ambiguous and non-HTTP captures are rejected',()=>{
  for(const input of [null,{},[],{url:5},{title:{}},{text:'https://one.example https://two.example'},{url:'a'.repeat(9000)}])assert.ok('error' in normalizeCapture(input))
  for(const url of ['javascript:alert(1)','data:text/html,bad','file:///private','chrome://settings','edge://newtab','https:example.com','https://example.com/a\nb','https://example.com/a b']) {
    assert.ok('error' in normalizeCapture({url}))
    assert.ok('error' in normalizeCapture({text:url}))
  }
  assert.ok('error' in normalizeCapture({url:'javascript:alert(1)',text:'https://valid.example'}))
})
test('long titles are bounded with an explanation while keeping a usable link',()=>{
  const result=normalizeCapture({url,title:'x'.repeat(121)})
  assert.ok('draft' in result)
  assert.equal(result.draft.title.length,120)
  assert.match(result.message,/shortened/)
})
