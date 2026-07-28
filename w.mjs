import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
const cdp = await p.context().newCDPSession(p);
await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8,latency:150});
await p.goto('https://www.gament1.ir/honors',{waitUntil:'load',timeout:90000});
// sample the hero + document geometry over time to catch the 12s event
for (let i=0;i<9;i++){
  const m = await p.evaluate(()=>{
    const hero=document.querySelector('div.relative.z-10.grid');
    const sec=document.querySelector('section.scroll-mt-24');
    const r=hero?.getBoundingClientRect();
    return {t:Math.round(performance.now()), docH:document.body.scrollHeight,
      heroY: r?Math.round(r.y+scrollY):-1, heroH: r?Math.round(r.height):-1,
      secH: sec?Math.round(sec.getBoundingClientRect().height):-1,
      imgs: document.images.length,
      pending: [...document.images].filter(i=>!i.complete).length};
  });
  console.log(`t=${String(m.t).padStart(6)} docH=${String(m.docH).padStart(5)} heroY=${String(m.heroY).padStart(4)} heroH=${String(m.heroH).padStart(4)} secH=${String(m.secH).padStart(4)} imgs=${m.imgs} pending=${m.pending}`);
  await p.waitForTimeout(1600);
}
await b.close();
