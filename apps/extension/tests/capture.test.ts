import assert from 'node:assert/strict'
import test from 'node:test'
import { captureAddress, DEFAULT_CARRY_ORIGIN } from '../src/capture.ts'

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
