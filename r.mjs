import { chromium } from '@playwright/test';
const b = await chromium.launch();
// Disable framer-motion animation via prefers-reduced-motion and re-measure.
for (const [label, reduced] of [['normal', null], ['reduced-motion', 'reduce']]) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, reducedMotion: reduced || 'no-preference' });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8,latency:150});
  await p.addInitScript(()=>{ window.__cls=0; new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput) window.__cls+=e.value;}}).observe({type:'layout-shift',buffered:true}); });
  await p.goto('https://www.gament1.ir/honors',{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(9000);
  const cls = await p.evaluate(()=>+(window.__cls||0).toFixed(4));
  console.log(`/honors  ${label.padEnd(16)} CLS=${cls}`);
  await ctx.close();
}
await b.close();
