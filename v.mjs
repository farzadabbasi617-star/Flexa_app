import { chromium } from '@playwright/test';
const b = await chromium.launch();
console.log('PAGE              CLS       VERDICT');
for (const path of ['/honors','/store/sell','/media-partners','/referrals','/','/store','/leaderboard','/tournaments']) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8,latency:150});
  await p.addInitScript(()=>{ window.__cls=0; new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput) window.__cls+=e.value;}}).observe({type:'layout-shift',buffered:true}); });
  try { await p.goto('https://www.gament1.ir'+path,{waitUntil:'load',timeout:90000}); } catch {}
  await p.waitForTimeout(6000);
  const cls = await p.evaluate(()=>+(window.__cls||0).toFixed(4)).catch(()=>-1);
  console.log(`${path.padEnd(17)} ${String(cls).padEnd(9)} ${cls<=0.1?'GOOD':'HIGH'}`);
  await p.close();
}
await b.close();
