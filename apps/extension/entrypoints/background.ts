import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { captureAddress, selectedTextAddress, DEFAULT_CARRY_ORIGIN } from '../src/capture'
export default defineBackground(()=>{
  const origin=import.meta.env.WXT_CARRY_ORIGIN||DEFAULT_CARRY_ORIGIN
  browser.runtime.onInstalled.addListener(()=>{
    browser.contextMenus.create({id:'carry-selected-text',title:'Carry selected text',contexts:['selection'],documentUrlPatterns:['http://*/*','https://*/*']})
  })
  function open(url:string,tabId?:number){
    void browser.tabs.create({url}).catch(()=>{
      if(tabId!==undefined) {
        void browser.action.setBadgeText({tabId,text:'!'})
        void browser.action.setTitle({tabId,title:'Carry could not open. Try again or open Carry and paste the link.'})
      }
    })
  }
  browser.action.onClicked.addListener(tab=>{
    open(captureAddress(tab,origin),tab.id)
  })
  browser.contextMenus.onClicked.addListener((info,tab)=>{
    if(info.menuItemId==='carry-selected-text'&&tab)open(selectedTextAddress(info,tab,origin),tab.id)
  })
})
