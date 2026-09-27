import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { captureAddress, DEFAULT_CARRY_ORIGIN } from '../src/capture'
export default defineBackground(()=>{
  browser.action.onClicked.addListener(tab=>{
    const origin=import.meta.env.WXT_CARRY_ORIGIN||DEFAULT_CARRY_ORIGIN
    void browser.tabs.create({url:captureAddress(tab,origin)}).catch(()=>{
      if(tab.id!==undefined) {
        void browser.action.setBadgeText({tabId:tab.id,text:'!'})
        void browser.action.setTitle({tabId:tab.id,title:'Carry could not open. Try again or open Carry and paste the link.'})
      }
    })
  })
})
