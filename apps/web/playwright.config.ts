import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir:'./e2e',fullyParallel:true,workers:2,timeout:60000,
  use:{trace:'retain-on-failure',reducedMotion:'reduce',screenshot:'only-on-failure',
    launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'mobile-chromium',use:{...devices['iPhone 13'],browserName:'chromium'}},
  ],
})
