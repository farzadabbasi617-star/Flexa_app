"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { parseTomanToRial } from "@/lib/money";
import { normalizeDigits } from "@/lib/phone";

interface RoomRow {
  id: string; title: string; description: string | null; region: "global"|"garena"; map: string; teamMode: "solo"|"duo"|"squad"; perspective: string;
  status: string; isPublished: boolean; capacity: number; registeredCount: number; entryFeeRial: string; serviceFeeRial: string; prizeBudgetRial: string;
  rewardConfig: { perKillRial?: string; participationRial?: string; maxKillsPerEntry?: number; placementRules?: Array<{ from:number;to:number;amountRial:string }> };
  referralRateBps?: number; minRankPoints: number; requiresRecording: boolean; startsAt: string; endsAt: string|null; checkInOpensAt: string|null; checkInClosesAt: string|null; credentialsRevealAt: string|null;
}
interface DetailEntry { id?: string; displayName: string; codUsername: string; status: string; checkedIn: boolean; kills?: number|null; placement?: number|null; resultStatus?: string; }
interface DetailRoom extends RoomRow { roomCode:string|null;roomPassword:string|null;officialJoinUrl:string|null;rules:string|null;rulesVersion:string;entries:DetailEntry[];evidenceCount:number;latestLobbyCheck?:null|{status:string;matchedCount:number;unauthorizedCount:number;missingCheckedInCount:number;confidence:number;unauthorizedUsernames?:string[];missingCheckedInUsernames?:string[];createdAt:string}; }

const statusNext: Record<string,string[]> = {
  draft:["draft","registration","cancelled"], registration:["registration","check_in","cancelled"], check_in:["check_in","lobby_open","cancelled"],
  lobby_open:["lobby_open","in_progress","cancelled"], in_progress:["in_progress","settling","cancelled"], settling:["settling","completed","in_progress","cancelled"], completed:["completed"], cancelled:["cancelled"],
};
const statusFa: Record<string,string> = { draft:"پیش‌نویس",registration:"ثبت‌نام",check_in:"Check-in",lobby_open:"Lobby باز",in_progress:"در اجرا",settling:"داوری",completed:"تکمیل",cancelled:"لغو" };
function tomanToRial(value: string|number) { return parseTomanToRial(String(value || "0")).toString(); }
function rialToToman(value: string|number|null|undefined) { try{return String(BigInt(String(value||0))/BigInt(10));}catch{return "0";} }
function localDate(value?:string|null){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function iso(value:string){return value?new Date(value).toISOString():null;}
function buildOperationalChecklist(room: DetailRoom, results: Record<string,{kills:string;placement:string}>) {
  const checkedInEntries = room.entries.filter((entry) => entry.checkedIn && entry.id);
  const resultRows = checkedInEntries.filter((entry) => {
    const row = entry.id ? results[entry.id] : undefined;
    return row && row.kills !== "";
  });
  const hasCredentials = Boolean(room.roomCode || room.officialJoinUrl);
  const lobbyStatus = room.latestLobbyCheck?.status || "missing";
  const hasLobbyVerified = lobbyStatus === "verified";
  return [
    { key:"published", label:"انتشار روم", ok:room.isPublished, detail:room.isPublished?"در COD Arena نمایش داده می‌شود":"روم هنوز مخفی است", level:room.isPublished?"ok":"warn" },
    { key:"schedule", label:"زمان‌بندی", ok:Boolean(room.startsAt && room.credentialsRevealAt), detail:room.credentialsRevealAt?"زمان شروع و نمایش کد تنظیم شده":"زمان نمایش کد/لینک کامل نیست", level:room.startsAt&&room.credentialsRevealAt?"ok":"warn" },
    { key:"credentials", label:"کد یا لینک Lobby", ok:hasCredentials, detail:hasCredentials?"اطلاعات ورود ثبت شده":"Room Code یا لینک رسمی COD را وارد کن", level:hasCredentials?"ok":"fail" },
    { key:"entries", label:"ثبت‌نام بازیکن", ok:room.entries.length>0, detail:`${room.entries.length.toLocaleString("fa-IR")} بازیکن ثبت‌نام شده`, level:room.entries.length>0?"ok":"warn" },
    { key:"checkin", label:"Check-in", ok:checkedInEntries.length>0, detail:`${checkedInEntries.length.toLocaleString("fa-IR")} نفر حضور را تأیید کرده‌اند`, level:checkedInEntries.length>0?"ok":"fail" },
    { key:"lobby", label:"بررسی هوشمند Lobby", ok:hasLobbyVerified, detail:lobbyStatus==="flagged"?"لابی مشکوک است":hasLobbyVerified?"آخرین بررسی verified است":"هنوز بررسی verified ندارید", level:hasLobbyVerified?"ok":lobbyStatus==="flagged"?"fail":"warn" },
    { key:"evidence", label:"مدارک و رکورد", ok:!room.requiresRecording || room.evidenceCount>0, detail:room.requiresRecording?`${room.evidenceCount.toLocaleString("fa-IR")} مدرک ثبت شده`:"رکورد برای این روم اختیاری است", level:(!room.requiresRecording || room.evidenceCount>0)?"ok":"warn" },
    { key:"results", label:"نتایج بازیکنان", ok:checkedInEntries.length>0 && resultRows.length===checkedInEntries.length, detail:`${resultRows.length.toLocaleString("fa-IR")}/${checkedInEntries.length.toLocaleString("fa-IR")} نتیجه آماده`, level:checkedInEntries.length>0&&resultRows.length===checkedInEntries.length?"ok":"warn" },
    { key:"settle", label:"آماده تسویه", ok:["in_progress","settling"].includes(room.status), detail:["in_progress","settling"].includes(room.status)?"وضعیت روم قابل تسویه است":"برای تسویه باید روم در اجرا یا داوری باشد", level:["in_progress","settling"].includes(room.status)?"ok":"warn" },
  ];
}
function OperationalChecklist({room,results}:{room:DetailRoom;results:Record<string,{kills:string;placement:string}>}){
  const items=buildOperationalChecklist(room,results);
  const okCount=items.filter((item)=>item.ok).length;
  const percent=Math.round((okCount/items.length)*100);
  const badge=(level:string)=>level==="ok"?"✅":level==="fail"?"❌":"⚠️";
  const cls=(level:string)=>level==="ok"?"border-emerald-500/25 bg-emerald-500/10 text-emerald-200":level==="fail"?"border-red-500/25 bg-red-500/10 text-red-200":"border-amber-500/25 bg-amber-500/10 text-amber-200";
  return <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[.025] p-4"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 className="font-black">چک‌لیست عملیاتی روم</h3><p className="mt-1 text-[10px] text-gray-500">قبل از شروع و تسویه، وضعیت موارد حیاتی روم را بررسی کن.</p></div><div className="min-w-32"><div className="text-left text-xs font-black text-orange-300">{okCount}/{items.length} آماده</div><div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-l from-emerald-400 to-orange-400" style={{width:`${percent}%`}}/></div></div></div><div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">{items.map((item)=><div key={item.key} className={`rounded-2xl border p-3 ${cls(item.level)}`}><div className="flex items-center justify-between gap-2"><b className="text-xs">{item.label}</b><span>{badge(item.level)}</span></div><p className="mt-1 text-[10px] leading-5 opacity-85">{item.detail}</p></div>)}</div></section>;
}
function safeRial(value: unknown){try{return BigInt(String(value||0));}catch{return BigInt(0);}}
function formatToman(value: bigint){return (value/BigInt(10)).toLocaleString("fa-IR");}
function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function buildSettlementCsv(room: DetailRoom, preview: ReturnType<typeof settlementPreview>) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["بازیکن", "نام کاربری COD", "Kill", "جایگاه", "جایزه Kill (تومان)", "جایزه جایگاه (تومان)", "جایزه حضور (تومان)", "جمع (تومان)"];
  const lines = [header.map(esc).join(",")];
  for (const { entry, breakdown } of preview.rewards) {
    lines.push([
      entry.displayName,
      entry.codUsername || "",
      breakdown.kills,
      breakdown.placement ?? "",
      Number(breakdown.killReward / BigInt(10)),
      Number(breakdown.placementReward / BigInt(10)),
      Number(breakdown.participation / BigInt(10)),
      Number(breakdown.total / BigInt(10)),
    ].map(esc).join(","));
  }
  return lines.join("\r\n");
}
function entryRewardBreakdown(room: DetailRoom, row?: {kills:string;placement:string}){
  const config=room.rewardConfig||{};
  const maxKills=Number(config.maxKillsPerEntry||100);
  const kills=Math.max(0,Math.min(maxKills,Number(row?.kills||0)));
  const placement=row?.placement?Number(row.placement):null;
  const perKill=safeRial(config.perKillRial);
  const participation=safeRial(config.participationRial);
  const placementRule=placement==null?undefined:(config.placementRules||[]).find((rule)=>placement>=rule.from&&placement<=rule.to);
  const killReward=perKill*BigInt(kills);
  const placementReward=safeRial(placementRule?.amountRial);
  const total=killReward+placementReward+participation;
  return {kills,placement,perKill,killReward,placementReward,participation,total};
}
function settlementPreview(room: DetailRoom, results: Record<string,{kills:string;placement:string}>){
  const activeEntries=room.entries.filter((entry)=>entry.status!=="cancelled"&&entry.status!=="refunded");
  const checkedIn=activeEntries.filter((entry)=>entry.checkedIn&&entry.id);
  const entryFee=safeRial(room.entryFeeRial);
  const serviceFee=safeRial(room.serviceFeeRial);
  const prizeBudget=safeRial(room.prizeBudgetRial);
  const grossEntry=entryFee*BigInt(activeEntries.length);
  const grossService=serviceFee*BigInt(activeEntries.length);
  const rewards=checkedIn.map((entry)=>({entry,breakdown:entryRewardBreakdown(room,entry.id?results[entry.id]:undefined)}));
  const totalReward=rewards.reduce((sum,row)=>sum+row.breakdown.total,BigInt(0));
  const remaining=prizeBudget-totalReward;
  const netAfterPrize=grossEntry-totalReward;
  return {activeEntries,checkedIn,rewards,entryFee,serviceFee,prizeBudget,grossEntry,grossService,totalReward,remaining,netAfterPrize,overBudget:totalReward>prizeBudget};
}
function SettlementFinancePreview({room,results}:{room:DetailRoom;results:Record<string,{kills:string;placement:string}>}){
  const preview=settlementPreview(room,results);
  const box=(label:string,value:bigint,tone="text-white")=><div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] text-gray-500">{label}</div><div className={`mt-1 text-sm font-black ${tone}`}>{formatToman(value)} تومان</div></div>;
  return <section className={`mt-5 rounded-[2rem] border p-4 ${preview.overBudget?"border-red-500/30 bg-red-500/10":"border-cyan-500/20 bg-cyan-950/10"}`}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 className="font-black">پیش‌نمایش مالی تسویه</h3><p className="mt-1 text-[10px] text-gray-500">قبل از پرداخت جایزه، اعداد مالی بر اساس نتایج واردشده محاسبه می‌شود.</p></div><div className="flex items-center gap-2">{preview.rewards.length>0&&<button onClick={()=>downloadCsv(`cod-settlement-${room.id}.csv`,buildSettlementCsv(room,preview))} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black hover:border-cyan-400/40">خروجی CSV</button>}<span className={`rounded-xl px-3 py-2 text-[10px] font-black ${preview.overBudget?"bg-red-500 text-black":"bg-cyan-500/15 text-cyan-200"}`}>{preview.checkedIn.length.toLocaleString("fa-IR")} بازیکن قابل تسویه</span></div></div><div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2">{box("کل ورودی ثبت‌نام",preview.grossEntry)}{box("کارمزد سرویس",preview.grossService,"text-orange-300")}{box("بودجه جایزه",preview.prizeBudget,"text-purple-200")}{box("مجموع جایزه محاسبه‌شده",preview.totalReward,preview.overBudget?"text-red-300":"text-emerald-300")}{box("باقی‌مانده بودجه",preview.remaining,preview.remaining<0?"text-red-300":"text-emerald-300")}</div><div className="mt-5 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[760px] text-xs"><thead className="bg-black/30 text-gray-500"><tr><th className="p-3 text-right">بازیکن</th><th className="p-3">Kill</th><th className="p-3">جایگاه</th><th className="p-3">جایزه Kill</th><th className="p-3">جایزه جایگاه</th><th className="p-3">جایزه حضور</th><th className="p-3">جمع</th></tr></thead><tbody>{preview.rewards.length===0?<tr><td colSpan={7} className="p-5 text-center text-gray-500">هنوز بازیکن Check-in شده‌ای برای محاسبه وجود ندارد.</td></tr>:preview.rewards.map(({entry,breakdown})=><tr key={entry.id} className="border-t border-white/5"><td className="p-3 text-right"><b>{entry.displayName}</b><div className="text-[10px] text-gray-600" dir="ltr">{entry.codUsername}</div></td><td className="p-3 text-center">{breakdown.kills.toLocaleString("fa-IR")}</td><td className="p-3 text-center">{breakdown.placement?breakdown.placement.toLocaleString("fa-IR"):"—"}</td><td className="p-3 text-center text-orange-200">{formatToman(breakdown.killReward)}</td><td className="p-3 text-center text-purple-200">{formatToman(breakdown.placementReward)}</td><td className="p-3 text-center text-cyan-200">{formatToman(breakdown.participation)}</td><td className="p-3 text-center font-black text-emerald-300">{formatToman(breakdown.total)}</td></tr>)}</tbody></table></div>{preview.overBudget&&<div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">مجموع جایزه از بودجه قفل‌شده بیشتر است؛ تسویه در Backend هم رد می‌شود. نتایج، جایزه هر Kill یا بودجه جایزه را اصلاح کن.</div>}</section>;
}

function AuditFeed(){
  const [feed,setFeed]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const r=await fetch("/api/admin/cod/audit",{cache:"no-store",credentials:"include"});
        const d=await r.json();
        if(!cancelled)setFeed(Array.isArray(d.feed)?d.feed:[]);
      }catch{ if(!cancelled)setFeed([]); }
      finally{ if(!cancelled)setLoading(false); }
    })();
    return ()=>{cancelled=true;};
  },[]);
  const fmt=(v?:string|null)=>{if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("fa-IR",{dateStyle:"short",timeStyle:"short"}).format(d);};
  const rewardToman=(v?:string|null)=>{if(!v)return"0";try{return Number(BigInt(String(v))/BigInt(10)).toLocaleString("fa-IR");}catch{return"0";}};
  return (
    <section className="mt-7 rounded-[2rem] border border-red-500/20 bg-red-950/10 p-5 sm:p-7">
      <h2 className="text-xl font-black">🛡️ ممیزی عملیات (Overrideها و تسویه‌ها)</h2>
      <p className="text-xs text-gray-500 mt-2">تغییروضعیت روم با override بررسی Lobby و تسویه‌هایی که با تایید دستی ادمین انجام شده‌اند، ثبت و نمایش داده می‌شوند.</p>
      {loading?<div className="p-8 text-center text-gray-500">در حال بارگذاری...</div>:feed.length===0?<div className="rounded-2xl border border-white/5 p-8 text-center text-gray-500 mt-4">موردی ثبت نشده است.</div>:(
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-black/30 text-gray-500"><tr><th className="p-3 text-right">نوع</th><th className="p-3 text-right">روم</th><th className="p-3">انجام‌دهنده</th><th className="p-3">جزئیات</th><th className="p-3">زمان</th></tr></thead>
            <tbody>
              {feed.map((f)=>(
                <tr key={f.id} className="border-t border-white/5">
                  <td className="p-3">
                    {f.kind==="start_override"?<span className="rounded-full bg-amber-500/15 text-amber-200 px-2 py-1">استارت override</span>:
                     f.kind==="settle_override"?<span className="rounded-full bg-red-500/15 text-red-200 px-2 py-1">تسویه override</span>:
                     <span className="rounded-full bg-emerald-500/15 text-emerald-200 px-2 py-1">تسویه</span>}
                  </td>
                  <td className="p-3 text-right"><b>{f.roomTitle||"روم"}</b><div className="text-[10px] text-gray-600" dir="ltr">{f.roomId}</div></td>
                  <td className="p-3">{f.actorName||f.adminName||"—"}</td>
                  <td className="p-3">
                    {f.kind==="start_override"
                      ? `${statusFa[f.fromStatus]||f.fromStatus||"—"} → ${statusFa[f.toStatus]||f.toStatus||"—"}`
                      : `${f.entryCount||0} بازیکن • جایزه ${rewardToman(f.totalRewardRial)} تومان${f.live?" • زنده":""}`}
                  </td>
                  <td className="p-3 text-gray-400">{fmt(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const initialForm = {
  id:"",title:"",description:"",region:"global" as "global"|"garena",map:"isolated",teamMode:"solo" as "solo"|"duo"|"squad",perspective:"tpp",status:"draft",isPublished:false,
  capacity:40,entryFeeToman:"0",serviceFeeToman:"0",prizeBudgetToman:"0",referralPercent:"20",perKillToman:"0",participationToman:"0",maxKillsPerEntry:40,
  firstToman:"0",secondToman:"0",thirdToman:"0",minRankPoints:0,requiresRecording:true,rulesVersion:"cod-beta-1",rules:"",
  roomCode:"",roomPassword:"",officialJoinUrl:"",checkInOpensAt:"",checkInClosesAt:"",credentialsRevealAt:"",startsAt:"",endsAt:"",
};

export default function AdminCodArenaPage(){
  const {user,loading:authLoading}=useAuth(); const router=useRouter();
  const [rooms,setRooms]=useState<RoomRow[]>([]); const [loading,setLoading]=useState(true); const [form,setForm]=useState(initialForm); const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [selected,setSelected]=useState<DetailRoom|null>(null); const [view,setView]=useState<"rooms"|"audit">("rooms");
  const [results,setResults]=useState<Record<string,{kills:string;placement:string}>>({}); const [evidenceConfirmed,setEvidenceConfirmed]=useState(false); const [lobbyOverrideConfirmed,setLobbyOverrideConfirmed]=useState(false); const [lobbyStartOverrideConfirmed,setLobbyStartOverrideConfirmed]=useState(false); const [staff,setStaff]=useState({identifier:"",role:"roomer"});
  const isAdmin=user?.role==="admin"||user?.role==="super_admin";

  useEffect(()=>{if(!authLoading&&(!user||!isAdmin))router.push("/");},[authLoading,user,isAdmin,router]);
  const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/admin/cod/rooms",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setRooms(d.rooms||[]);}catch(e){setError(e instanceof Error?e.message:"بارگذاری نشد");}finally{setLoading(false);}},[]);
  useEffect(()=>{if(isAdmin)load();},[isAdmin,load]);

  const payload=useMemo(()=>({
    ...form,
    lobbyOverrideConfirmed:lobbyStartOverrideConfirmed,
    entryFeeRial:tomanToRial(form.entryFeeToman),serviceFeeRial:tomanToRial(form.serviceFeeToman),prizeBudgetRial:tomanToRial(form.prizeBudgetToman),referralRateBps:Math.round(Number(normalizeDigits(String(form.referralPercent||0)).replace("٫","."))*100),
    rewardConfig:{perKillRial:tomanToRial(form.perKillToman),participationRial:tomanToRial(form.participationToman),maxKillsPerEntry:Number(form.maxKillsPerEntry),placementRules:[
      ...(Number(form.firstToman)>0?[{from:1,to:1,amountRial:tomanToRial(form.firstToman)}]:[]),...(Number(form.secondToman)>0?[{from:2,to:2,amountRial:tomanToRial(form.secondToman)}]:[]),...(Number(form.thirdToman)>0?[{from:3,to:3,amountRial:tomanToRial(form.thirdToman)}]:[]),
    ]},
    startsAt:iso(form.startsAt),endsAt:iso(form.endsAt),checkInOpensAt:iso(form.checkInOpensAt),checkInClosesAt:iso(form.checkInClosesAt),credentialsRevealAt:iso(form.credentialsRevealAt),
  }),[form,lobbyStartOverrideConfirmed]);

  function begin(){setForm({...initialForm,startsAt:localDate(new Date(Date.now()+24*60*60_000).toISOString())});setLobbyStartOverrideConfirmed(false);setShowForm(true);setSelected(null);setError("");}
  async function edit(room:RoomRow){
    setError("");
    try {
      const response=await fetch(`/api/cod/rooms/${room.id}`,{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"اطلاعات روم دریافت نشد");
      const full=data.room as DetailRoom;
      setForm({...initialForm,id:full.id,title:full.title,description:full.description||"",region:full.region,map:full.map,teamMode:full.teamMode,perspective:full.perspective,status:full.status,isPublished:full.isPublished,capacity:full.capacity,entryFeeToman:rialToToman(full.entryFeeRial),serviceFeeToman:rialToToman(full.serviceFeeRial),prizeBudgetToman:rialToToman(full.prizeBudgetRial),referralPercent:String(Number(full.referralRateBps||0)/100),perKillToman:rialToToman(full.rewardConfig?.perKillRial),participationToman:rialToToman(full.rewardConfig?.participationRial),maxKillsPerEntry:Number(full.rewardConfig?.maxKillsPerEntry||40),firstToman:rialToToman(full.rewardConfig?.placementRules?.find(x=>x.from===1)?.amountRial),secondToman:rialToToman(full.rewardConfig?.placementRules?.find(x=>x.from===2)?.amountRial),thirdToman:rialToToman(full.rewardConfig?.placementRules?.find(x=>x.from===3)?.amountRial),minRankPoints:full.minRankPoints,requiresRecording:full.requiresRecording,rulesVersion:full.rulesVersion||"cod-beta-1",rules:full.rules||"",roomCode:full.roomCode||"",roomPassword:full.roomPassword||"",officialJoinUrl:full.officialJoinUrl||"",startsAt:localDate(full.startsAt),endsAt:localDate(full.endsAt),checkInOpensAt:localDate(full.checkInOpensAt),checkInClosesAt:localDate(full.checkInClosesAt),credentialsRevealAt:localDate(full.credentialsRevealAt)});
      setLobbyStartOverrideConfirmed(false);setShowForm(true);setSelected(null);scrollTo({top:0,behavior:"smooth"});
    } catch(e){setError(e instanceof Error?e.message:"اطلاعات روم دریافت نشد");}
  }
  async function save(e:FormEvent){e.preventDefault();setSaving(true);setError("");setMessage("");try{const r=await fetch("/api/admin/cod/rooms",{method:form.id?"PATCH":"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||"ذخیره نشد");setMessage(form.id?"روم به‌روزرسانی شد":"روم COD ساخته شد");setShowForm(false);setForm(initialForm);await load();}catch(e){setError(e instanceof Error?e.message:"ذخیره نشد");}finally{setSaving(false);}}
  async function remove(id:string){if(!confirm("فقط Draft خالی قابل حذف است. حذف شود؟"))return;const r=await fetch("/api/admin/cod/rooms",{method:"DELETE",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({id})});const d=await r.json();if(!r.ok){setError(d.error||"حذف نشد");return;}load();}
  async function openOps(id:string){setError("");const r=await fetch(`/api/cod/rooms/${id}`,{cache:"no-store"});const d=await r.json();if(!r.ok){setError(d.error||"دریافت نشد");return;}setSelected(d.room);const next:Record<string,{kills:string;placement:string}>={};for(const e of d.room.entries||[])if(e.id)next[e.id]={kills:String(e.kills||0),placement:e.placement?String(e.placement):""};setResults(next);setEvidenceConfirmed(false);setLobbyOverrideConfirmed(false);setShowForm(false);}
  async function settle(){if(!selected||!confirm("نتایج نهایی و روم تسویه شود؟"))return;setSaving(true);setError("");try{const eligibleIds=new Set(selected.entries.filter(entry=>entry.id&&entry.checkedIn).map(entry=>entry.id));const body={evidenceConfirmed,lobbyOverrideConfirmed,results:Object.entries(results).filter(([entryId])=>eligibleIds.has(entryId)).map(([entryId,v])=>({entryId,kills:Number(v.kills||0),placement:v.placement?Number(v.placement):null}))};const r=await fetch(`/api/admin/cod/rooms/${selected.id}/settle`,{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||"تسویه نشد");setMessage(`تسویه ${d.settlement.entryCount} بازیکن با موفقیت ثبت شد.`);setSelected(null);await load();}catch(e){setError(e instanceof Error?e.message:"تسویه نشد");}finally{setSaving(false);}}
  async function assignStaff(){if(!selected||!staff.identifier)return;const r=await fetch(`/api/admin/cod/rooms/${selected.id}/staff`,{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify(staff)});const d=await r.json();if(!r.ok){setError(d.error||"تخصیص انجام نشد");return;}setMessage("عامل اجرایی به روم اضافه شد");setStaff({identifier:"",role:"roomer"});}
  if(authLoading||!isAdmin)return null;

  const input="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm outline-none focus:border-orange-400";
  return <div className="min-h-screen bg-[#070707] text-white"><Navbar/><main className="max-w-7xl mx-auto px-4 sm:px-6 py-7" dir="rtl">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><div><Link href="/admin" className="text-xs text-gray-500">← داشبورد</Link><h1 className="text-3xl font-black mt-3">🎯 مرکز عملیات COD Arena</h1><p className="text-xs text-gray-500 mt-2">ساخت روم، چرخه Lobby، عوامل اجرایی، مدرک، نتیجه، رنک، جایزه و رفرال</p></div><div className="flex gap-2"><Link href="/cod-arena" className="rounded-xl border border-white/10 px-4 py-3 text-xs font-black">نمای بازیکن</Link><button onClick={begin} className="rounded-xl bg-orange-500 text-black px-5 py-3 text-xs font-black">+ روم جدید</button></div></div>
    <div className="mt-5 flex flex-wrap gap-2">
      <button onClick={()=>setView("rooms")} className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${view==="rooms"?"bg-orange-500 text-black":"border border-white/10 bg-white/5 text-gray-300"}`}>🎮 روم‌ها و عملیات</button>
      <button onClick={()=>setView("audit")} className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${view==="audit"?"bg-red-500 text-black":"border border-white/10 bg-white/5 text-gray-300"}`}>🛡️ ممیزی عملیات</button>
    </div>
    {error&&<div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}{message&&<div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}

    {showForm&&<form onSubmit={save} className="mt-6 rounded-[2rem] border border-orange-500/20 bg-orange-950/10 p-5 sm:p-7 space-y-6">
      <div className="flex justify-between"><h2 className="text-xl font-black">{form.id?"ویرایش روم":"ساخت روم COD"}</h2><button type="button" onClick={()=>setShowForm(false)} className="text-gray-500">✕</button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="lg:col-span-2 text-xs text-gray-400">عنوان<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">ریجن<select value={form.region} onChange={e=>setForm({...form,region:e.target.value as "global"|"garena"})} className={`${input} mt-1`}><option value="global">Global</option><option value="garena">Garena</option></select></label><label className="text-xs text-gray-400">حالت<select value={form.teamMode} onChange={e=>setForm({...form,teamMode:e.target.value as "solo"|"duo"|"squad"})} className={`${input} mt-1`}><option value="solo">Solo</option><option value="duo">Duo</option><option value="squad">Squad</option></select></label><label className="text-xs text-gray-400">Map<input value={form.map} onChange={e=>setForm({...form,map:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">Perspective<select value={form.perspective} onChange={e=>setForm({...form,perspective:e.target.value})} className={`${input} mt-1`}><option value="tpp">TPP</option><option value="fpp">FPP</option></select></label><label className="text-xs text-gray-400">ظرفیت<input type="number" min={2} max={100} value={form.capacity} onChange={e=>setForm({...form,capacity:Number(e.target.value)})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">حداقل RP<input type="number" min={0} value={form.minRankPoints} onChange={e=>setForm({...form,minRankPoints:Number(e.target.value)})} className={`${input} mt-1`}/></label></div>
      <label className="block text-xs text-gray-400">توضیحات<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} className={`${input} mt-1`}/></label>
      <div><h3 className="font-black text-orange-300 mb-3">اقتصاد روم — تومان</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[["ورودی","entryFeeToman"],["کارمزد Gament","serviceFeeToman"],["بودجه جایزه","prizeBudgetToman"],["رفرال از کارمزد %","referralPercent"],["هر Kill","perKillToman"],["جایزه حضور","participationToman"],["نفر اول","firstToman"],["نفر دوم","secondToman"],["نفر سوم","thirdToman"]].map(([label,key])=><label key={key} className="text-xs text-gray-400">{label}<input inputMode="numeric" value={String(form[key as keyof typeof form])} onChange={e=>setForm({...form,[key]:e.target.value})} className={`${input} mt-1`}/></label>)}<label className="text-xs text-gray-400">سقف Kill<input type="number" min={1} max={100} value={form.maxKillsPerEntry} onChange={e=>setForm({...form,maxKillsPerEntry:Number(e.target.value)})} className={`${input} mt-1`}/></label></div></div>
      <div><h3 className="font-black text-orange-300 mb-3">زمان‌بندی</h3><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs text-gray-400">شروع روم<input required type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">شروع Check-in<input type="datetime-local" value={form.checkInOpensAt} onChange={e=>setForm({...form,checkInOpensAt:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">پایان Check-in<input type="datetime-local" value={form.checkInClosesAt} onChange={e=>setForm({...form,checkInClosesAt:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">نمایش کد و لینک<input type="datetime-local" value={form.credentialsRevealAt} onChange={e=>setForm({...form,credentialsRevealAt:e.target.value})} className={`${input} mt-1`}/></label><label className="text-xs text-gray-400">پایان تقریبی<input type="datetime-local" value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})} className={`${input} mt-1`}/></label></div></div>
      <div><h3 className="font-black text-orange-300 mb-3">اطلاعات محرمانه Lobby</h3><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs text-gray-400">Room Code<input value={form.roomCode} onChange={e=>setForm({...form,roomCode:e.target.value})} className={`${input} mt-1`} dir="ltr"/></label><label className="text-xs text-gray-400">Password<input value={form.roomPassword} onChange={e=>setForm({...form,roomPassword:e.target.value})} className={`${input} mt-1`} dir="ltr"/></label><label className="text-xs text-gray-400">لینک رسمی COD<input value={form.officialJoinUrl} onChange={e=>setForm({...form,officialJoinUrl:e.target.value})} className={`${input} mt-1`} dir="ltr"/></label></div></div>
      <label className="block text-xs text-gray-400">قوانین<textarea value={form.rules} onChange={e=>setForm({...form,rules:e.target.value})} rows={6} className={`${input} mt-1`}/></label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs text-gray-400">وضعیت<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={`${input} mt-1`}>{(statusNext[form.status]||[form.status]).map(x=><option key={x} value={x}>{statusFa[x]||x}</option>)}</select></label><label className="flex items-center gap-2 text-xs mt-7"><input type="checkbox" checked={form.requiresRecording} onChange={e=>setForm({...form,requiresRecording:e.target.checked})}/> رکورد بازیکنان الزامی</label><label className="flex items-center gap-2 text-xs mt-7"><input type="checkbox" checked={form.isPublished} onChange={e=>setForm({...form,isPublished:e.target.checked})}/> نمایش در COD Arena</label></div>
      {form.status==="in_progress"&&<label className="flex gap-3 items-start rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-200"><input type="checkbox" checked={lobbyStartOverrideConfirmed} onChange={e=>setLobbyStartOverrideConfirmed(e.target.checked)} className="mt-1"/><span>اگر آخرین بررسی Lobby هنوز verified نیست، با مسئولیت ادمین اجازه شروع/درج وضعیت در اجرا را صادر می‌کنم.</span></label>}
      <button disabled={saving} className="rounded-2xl bg-orange-500 text-black px-8 py-3.5 text-sm font-black disabled:opacity-50">{saving?"در حال ذخیره...":"ذخیره امن روم"}</button>
    </form>}

    {view==="rooms"&&selected&&<section className="mt-6 rounded-[2rem] border border-purple-500/20 bg-purple-950/10 p-5 sm:p-7"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-black">عملیات و تسویه: {selected.title}</h2><p className="text-xs text-gray-500 mt-2">مدارک: {selected.evidenceCount} • بازیکنان: {selected.entries.length}</p></div><button onClick={()=>setSelected(null)}>✕</button></div><OperationalChecklist room={selected} results={results}/><SettlementFinancePreview room={selected} results={results}/>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto] gap-2 mt-5"><input value={staff.identifier} onChange={e=>setStaff({...staff,identifier:e.target.value})} placeholder="Username / Gament ID عامل اجرایی" className={input}/><select value={staff.role} onChange={e=>setStaff({...staff,role:e.target.value})} className={input}><option value="roomer">Roomer</option><option value="spectator">Spectator</option><option value="judge">Judge</option></select><button onClick={assignStaff} className="rounded-xl bg-purple-600 px-4 text-xs font-black">تخصیص</button></div>
      <div className="overflow-x-auto mt-6"><table className="w-full min-w-[650px] text-xs"><thead className="text-gray-500"><tr><th className="text-right p-2">بازیکن</th><th className="p-2">Check-in</th><th className="p-2">Kill</th><th className="p-2">Placement</th><th className="p-2">وضعیت</th></tr></thead><tbody>{selected.entries.map(e=>e.id&&<tr key={e.id} className="border-t border-white/5"><td className="p-2"><b>{e.displayName}</b><div className="text-gray-600" dir="ltr">{e.codUsername}</div></td><td className="p-2 text-center">{e.checkedIn?"✅":"—"}</td><td className="p-2"><input type="number" min={0} max={100} disabled={!e.checkedIn} value={results[e.id]?.kills||"0"} onChange={x=>setResults({...results,[e.id!]:{...results[e.id!],kills:x.target.value}})} className="w-20 rounded-lg bg-black/40 border border-white/10 p-2 text-center"/></td><td className="p-2"><input type="number" min={1} max={100} disabled={!e.checkedIn} value={results[e.id]?.placement||""} onChange={x=>setResults({...results,[e.id!]:{...results[e.id!],placement:x.target.value}})} className="w-20 rounded-lg bg-black/40 border border-white/10 p-2 text-center"/></td><td className="p-2 text-center">{e.status}</td></tr>)}</tbody></table></div>
      <div className={`mt-5 rounded-2xl border p-4 text-xs ${selected.latestLobbyCheck?.status==="flagged"?"border-red-500/30 bg-red-500/10 text-red-200":selected.latestLobbyCheck?.status==="verified"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-200":"border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>{selected.latestLobbyCheck?<>آخرین بررسی لابی: <b>{selected.latestLobbyCheck.status}</b> • مجاز: {selected.latestLobbyCheck.matchedCount} • غیرمجاز: {selected.latestLobbyCheck.unauthorizedCount} • غایب‌های Check-in: {selected.latestLobbyCheck.missingCheckedInCount} • اطمینان AI: {selected.latestLobbyCheck.confidence}%{selected.latestLobbyCheck.unauthorizedUsernames?.length?<div className="mt-2">غیرمجازها: {selected.latestLobbyCheck.unauthorizedUsernames.slice(0,8).join("، ")}</div>:null}</>:"برای امنیت بهتر قبل از تسویه، Roomer/Spectator از صفحه روم بررسی هوشمند Lobby را انجام دهد."}</div>
      {selected.latestLobbyCheck?.status==="flagged"&&<label className="flex gap-3 items-start text-xs leading-6 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"><input type="checkbox" checked={lobbyOverrideConfirmed} onChange={e=>setLobbyOverrideConfirmed(e.target.checked)} className="mt-1"/><span>آخرین بررسی Lobby وضعیت مشکوک دارد؛ با مسئولیت ادمین تأیید می‌کنم که موارد غیرمجاز بررسی شده و تسویه ادامه پیدا کند.</span></label>}
      <label className="flex gap-3 items-start text-xs leading-6 mt-5"><input type="checkbox" checked={evidenceConfirmed} onChange={e=>setEvidenceConfirmed(e.target.checked)} className="mt-1"/><span>رکورد Lobby، Scoreboard و موارد مشکوک را بررسی کرده‌ام و مسئولیت تأیید نتیجه را می‌پذیرم.</span></label><div className="flex flex-wrap gap-2 mt-4"><Link href={`/cod-arena/${selected.id}`} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-black">ثبت/مشاهده مدارک</Link><button onClick={settle} disabled={saving||!evidenceConfirmed||(selected.latestLobbyCheck?.status==="flagged"&&!lobbyOverrideConfirmed)||settlementPreview(selected,results).overBudget||!["in_progress","settling"].includes(selected.status)} className="rounded-xl bg-emerald-500 text-black px-5 py-3 text-xs font-black disabled:opacity-40">تسویه نهایی</button></div>
    </section>}

    {view==="rooms"&&<section className="mt-7"><h2 className="text-xl font-black mb-4">روم‌ها</h2>{loading?<div className="p-10 text-center text-gray-500">در حال بارگذاری...</div>:rooms.length===0?<div className="rounded-3xl border border-white/5 p-10 text-center text-gray-500">هنوز رومی ساخته نشده است.</div>:<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{rooms.map(room=><article key={room.id} className="rounded-3xl border border-white/10 bg-white/[.025] p-5"><div className="flex justify-between gap-3"><div><div className="flex gap-2 text-[9px]"><span className="rounded-full bg-orange-500/10 text-orange-300 px-2 py-1">{room.region.toUpperCase()}</span><span className="rounded-full bg-white/5 px-2 py-1">{statusFa[room.status]}</span>{!room.isPublished&&<span className="rounded-full bg-gray-500/10 px-2 py-1">مخفی</span>}</div><h3 className="font-black text-lg mt-3">{room.title}</h3><p className="text-[10px] text-gray-500 mt-2">{localDate(room.startsAt).replace("T"," ")} • {room.teamMode.toUpperCase()} • {room.map}</p></div><div className="text-left"><div className="text-xl font-black">{room.registeredCount}/{room.capacity}</div><div className="text-[9px] text-gray-500">بازیکن</div></div></div><div className="flex flex-wrap gap-2 mt-5"><button onClick={()=>edit(room)} className="rounded-xl border border-white/10 px-3 py-2 text-xs">ویرایش</button><button onClick={()=>openOps(room.id)} className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-black">عملیات/نتیجه</button><Link href={`/cod-arena/${room.id}`} className="rounded-xl border border-orange-500/20 text-orange-300 px-3 py-2 text-xs">نمای روم</Link>{room.status==="draft"&&room.registeredCount===0&&<button onClick={()=>remove(room.id)} className="rounded-xl text-red-400 px-3 py-2 text-xs">حذف</button>}</div></article>)}</div>}</section>}
    {view==="audit"&&<AuditFeed/>}
  </main></div>;
}
