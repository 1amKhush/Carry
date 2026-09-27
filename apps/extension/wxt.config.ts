import { defineConfig } from 'wxt'
export default defineConfig({
  outDir:process.env.CARRY_EXTENSION_OUT_DIR,
  manifest:{
    name:'Carry this page',description:'Open the current page as a draft in Carry. Review it before sending.',
    permissions:['activeTab'],action:{default_title:'Carry this page'},
    icons:{16:'icon-16.png',32:'icon-32.png',48:'icon-48.png',128:'icon-128.png'},
  },
})
