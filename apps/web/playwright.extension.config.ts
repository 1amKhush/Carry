import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./extension-tests',workers:1,timeout:60000,
  use:{trace:'retain-on-failure'},
  projects:[{name:'chrome'},{name:'edge'}],
})
