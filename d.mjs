import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const path of ['/honors','/tournaments']) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8,latency:150});
  await p.addInitScript(()=>{ window.__s=[];
    new PerformanceObserver(l=>{for(const e of l.getEntries()){ if(e.hadRecentInput) continue;
      window.__s.push({v:+e.value.toFixed(4),t:Math.round(e.startTime),
        n:(e.sources||[]).slice(0,2).map(s=>{const x=s.node; if(!x||!x.tagName) return '?';
          const pr=s.previousRect, cr=s.currentRect;
          return `${x.tagName}.${(typeof x.className==='string'?x.className.trim().split(/\s+/).slice(0,2).join('.'):'')} y:${Math.round(pr.y)}->${Math.round(cr.y)} h:${Math.round(pr.height)}->${Math.round(cr.height)}`;})});
    }}).observe({type:'layout-shift',buffered:true});});
  await p.goto('https://www.gament1.ir'+path,{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(9000);
  const s = await p.evaluate(()=>window.__s.sort((a,b)=>b.v-a.v).slice(0,4));
  console.log(`\n=== ${path} ===`);
  for (const x of s) console.log(`  ${String(x.v).padStart(7)} @${String(x.t).padStart(6)}ms  ${x.n.join('\n            ')}`);
  await p.close();
}
await b.close();
