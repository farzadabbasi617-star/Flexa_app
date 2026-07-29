import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.goto('https://www.gament1.ir/tournaments/e697be3b-9fc5-424c-b025-478e89836f08',{waitUntil:'networkidle',timeout:90000});
await p.waitForTimeout(4000);
const links = await p.evaluate(()=>[...document.querySelectorAll('a[href*="t.me"]')].map(a=>({text:a.textContent.trim().slice(0,40), href:a.href})));
console.log('telegram links on page:');
links.forEach(l=>console.log(`  "${l.text}" -> ${l.href}`));
// also what the client bundle thinks the env var is
const env = await p.evaluate(()=>{
  const s=[...document.scripts].map(x=>x.textContent||'').join('');
  const m=s.match(/NEXT_PUBLIC_TELEGRAM_BOT_USERNAME[^,}]{0,60}/);
  return m?m[0]:'(not found in inline scripts)';
});
console.log('\nenv in bundle:', env);
await b.close();
