import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.goto('https://www.gament1.ir/honors',{waitUntil:'load',timeout:90000});
await p.waitForTimeout(4000);
// find the element that shifts: DIV.relative.z-10 (the hero grid)
const info = await p.evaluate(()=>{
  const el = document.querySelector('div.relative.z-10.grid');
  if(!el) return {found:false};
  const cs = getComputedStyle(el);
  const parent = el.parentElement, pcs = parent?getComputedStyle(parent):null;
  return { found:true, transform: cs.transform, willChange: cs.willChange,
    opacity: cs.opacity, contain: cs.contain,
    parentTag: parent?.tagName, parentTransform: pcs?.transform, parentClass: (parent?.className||'').slice(0,80) };
});
console.log(JSON.stringify(info,null,1));
await b.close();
