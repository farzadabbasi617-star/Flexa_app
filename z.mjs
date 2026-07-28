import { chromium } from '@playwright/test';
const b = await chromium.launch();
// Real-user simulation: load, then scroll like a person. Chrome excludes
// shifts within 500ms of user input, so this reflects the field CLS.
for (const path of ['/honors','/tournaments']) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8,latency:150});
  await p.addInitScript(()=>{ window.__cls=0; window.__n=0;
    new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput){window.__cls+=e.value;window.__n++;}}}).observe({type:'layout-shift',buffered:true}); });
  await p.goto('https://www.gament1.ir'+path,{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(2500);
  const settled = await p.evaluate(()=>+(window.__cls||0).toFixed(4));
  // now scroll as a user would
  for (let i=0;i<6;i++){ await p.mouse.wheel(0,600); await p.waitForTimeout(700); }
  await p.waitForTimeout(3000);
  const after = await p.evaluate(()=>({c:+(window.__cls||0).toFixed(4), n:window.__n}));
  console.log(`${path.padEnd(14)} load-only=${String(settled).padEnd(8)} after-scroll=${String(after.c).padEnd(8)} shifts=${after.n}`);
  await p.close();
}
await b.close();
