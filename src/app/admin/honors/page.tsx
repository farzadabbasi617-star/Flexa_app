"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface Honor {
  id: string;
  type: "winner" | "levelup" | "news" | string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight: boolean;
  status: "pending" | "approved" | "rejected";
  image?: string;
  createdAt?: string;
  publishedAt?: string | null;
  likesCount?: number;
  viewsCount?: number;
}

export default function AdminHonorsPage() {
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [autoNewsLoading, setAutoNewsLoading] = useState(false);
  const [telegramDraft, setTelegramDraft] = useState("");

  const [newHonor, setNewHonor] = useState({
    type: "news" as const,
    title: "",
    description: "",
    prize: "",
    username: "",
    level: "",
    game: "",
    highlight: false,
    image: "",
  });

  const fetchHonors = async () => {
    const res = await fetch("/api/admin/honors", { cache: "no-store" });
    const data = await res.json();
    setHonors(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchHonors();
  }, []);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    await fetch("/api/admin/honors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id, status }),
    });
    fetchHonors();
  };

  const deleteHonor = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    await fetch("/api/admin/honors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id }),
    });
    fetchHonors();
  };

  const generateAiDraft = async () => {
    setAiDraftLoading(true);
    try {
      const res = await fetch("/api/admin/honors/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(newHonor),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ساخت متن انجام نشد");
      setNewHonor((prev) => ({ ...prev, title: data.title || prev.title, description: data.description || prev.description }));
      setTelegramDraft(data.telegramPost || "");
    } catch (err) {
      alert(err instanceof Error ? err.message : "ساخت متن انجام نشد");
    } finally {
      setAiDraftLoading(false);
    }
  };


  const generateAutoNews = async () => {
    setAutoNewsLoading(true);
    try {
      const res = await fetch("/api/admin/honors/auto-news", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ساخت خبر خودکار انجام نشد");
      if (data.generated) alert(`خبر خودکار ساخته شد: ${data.title}`);
      else alert(`خبری ساخته نشد: ${data.reason || "نامشخص"}`);
      fetchHonors();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ساخت خبر خودکار انجام نشد");
    } finally {
      setAutoNewsLoading(false);
    }
  };

  const createHonor = async () => {
    if (!newHonor.title || !newHonor.description) {
      alert("عنوان و توضیحات الزامی است");
      return;
    }

    const payload = {
      ...newHonor,
      level: newHonor.level ? parseInt(newHonor.level) : undefined,
      time: "همین الان",
      status: "approved",
    };

    await fetch("/api/admin/honors", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(payload),
    });

    setNewHonor({
      type: "news",
      title: "",
      description: "",
      prize: "",
      username: "",
      level: "",
      game: "",
      highlight: false,
      image: "",
    });

    fetchHonors();
  };

  // شروع ویرایش
  const startEdit = (honor: Honor) => {
    setEditingId(honor.id);
    setEditData({ ...honor });
  };

  // ذخیره تغییرات
  const saveEdit = async () => {
    if (!editingId) return;

    await fetch("/api/admin/honors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        id: editingId,
        ...editData,
      }),
    });

    setEditingId(null);
    setEditData({});
    fetchHonors();
  };

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black">مدیریت تالار افتخارات</h1>
            <p className="text-sm text-gray-400 mt-1">ایجاد، ویرایش، تأیید و حذف محتوا</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={generateAutoNews}
              disabled={autoNewsLoading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-xl text-xs font-black transition-all"
            >
              {autoNewsLoading ? "در حال ساخت خبر..." : "📰 ساخت خبر خودکار"}
            </button>
            <Link href="/admin" className="text-sm text-purple-400">← بازگشت به پنل</Link>
          </div>
        </div>

        {/* فرم ایجاد */}
        <div className="glass-panel p-6 rounded-3xl mb-10 border border-white/10">
          <h3 className="font-black mb-5 text-lg">ایجاد محتوای جدید</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <select 
              value={newHonor.type} 
              onChange={(e) => setNewHonor({...newHonor, type: e.target.value as any})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            >
              <option value="news">خبر</option>
              <option value="winner">قهرمان</option>
              <option value="levelup">لول‌آپ</option>
            </select>

            <input 
              placeholder="عنوان" 
              value={newHonor.title}
              onChange={(e) => setNewHonor({...newHonor, title: e.target.value})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            />
          </div>

          <textarea 
            placeholder="توضیحات" 
            value={newHonor.description}
            onChange={(e) => setNewHonor({...newHonor, description: e.target.value})}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm mb-4 h-24 resize-y"
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <input placeholder="نام کاربری" value={newHonor.username} onChange={(e) => setNewHonor({...newHonor, username: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="جایزه (اختیاری)" value={newHonor.prize} onChange={(e) => setNewHonor({...newHonor, prize: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="لول (اختیاری)" value={newHonor.level} onChange={(e) => setNewHonor({...newHonor, level: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <select value={newHonor.game} onChange={(e) => setNewHonor({...newHonor, game: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm">
              <option value="">همه بازی‌ها</option>
              <option value="clash_royale">کلش رویال</option>
              <option value="cod_mobile">کالاف موبایل</option>
              <option value="fortnite">فورتنایت</option>
            </select>
          </div>

          <input 
            placeholder="لینک تصویر (URL)" 
            value={newHonor.image}
            onChange={(e) => setNewHonor({...newHonor, image: e.target.value})}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm mb-4"
          />

          <div className="flex items-center gap-3 mb-5">
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={newHonor.highlight} 
                onChange={(e) => setNewHonor({...newHonor, highlight: e.target.checked})} 
              />
              محتوای ویژه (Featured)
            </label>
          </div>

          {telegramDraft && (
            <div className="bg-black/25 border border-white/10 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-cyan-300 mb-2">متن پیشنهادی تلگرام</div>
              <pre className="whitespace-pre-wrap text-[11px] leading-6 text-gray-300 font-sans">{telegramDraft}</pre>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateAiDraft}
              disabled={aiDraftLoading}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 px-8 py-3 rounded-2xl text-sm font-black transition-all"
            >
              {aiDraftLoading ? "در حال ساخت..." : "✨ ساخت متن با AI"}
            </button>
            <button 
              onClick={createHonor} 
              className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-2xl text-sm font-black transition-all"
            >
              ایجاد محتوا
            </button>
          </div>
        </div>

        {/* لیست محتواها */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">در حال بارگذاری...</div>
          ) : honors.length === 0 ? (
            <div className="text-center py-12 text-gray-500">هنوز محتوایی ثبت نشده است.</div>
          ) : (
            honors.map((honor) => (
              <div key={honor.id} className="glass-panel p-6 rounded-3xl border border-white/10">
                {editingId === honor.id ? (
                  // فرم ویرایش
                  <div className="space-y-4">
                    <input 
                      value={editData.title} 
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3"
                    />
                    <textarea 
                      value={editData.description} 
                      onChange={(e) => setEditData({...editData, description: e.target.value})}
                      className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 h-24"
                    />
                    <input 
                      placeholder="لینک تصویر" 
                      value={editData.image || ""} 
                      onChange={(e) => setEditData({...editData, image: e.target.value})}
                      className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3"
                    />
                    <div className="flex gap-3">
                      <button onClick={saveEdit} className="bg-green-600 px-6 py-2 rounded-xl text-sm">ذخیره</button>
                      <button onClick={() => setEditingId(null)} className="bg-gray-600 px-6 py-2 rounded-xl text-sm">انصراف</button>
                    </div>
                  </div>
                ) : (
                  // نمایش عادی
                  <div className="flex justify-between gap-6">
                    <div className="flex-1">
                      <div className="font-black text-xl mb-1.5">{honor.title}</div>
                      <p className="text-sm text-white/80 mb-4 leading-relaxed">{honor.description}</p>
                      
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                        {honor.username && <span>@{honor.username}</span>}
                        {honor.level && <span>سطح {honor.level}</span>}
                        {honor.prize && <span className="text-yellow-400">{honor.prize}</span>}
                        <span>{honor.time || (honor.publishedAt || honor.createdAt ? new Date(honor.publishedAt || honor.createdAt!).toLocaleString("fa-IR") : "—")}</span>
                        <span className="text-pink-300">لایک: {(honor.likesCount || 0).toLocaleString("fa-IR")}</span>
                        <span className="text-cyan-300">سین/بازدید: {(honor.viewsCount || 0).toLocaleString("fa-IR")}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 min-w-[150px]">
                      <div className={`text-xs px-3 py-1 rounded-full border text-center ${
                        honor.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        honor.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>
                        {honor.status === "approved" ? "منتشر شده" : honor.status === "rejected" ? "رد شده" : "در انتظار تأیید"}
                      </div>

                      {honor.status === "pending" && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus(honor.id, "approved")} className="text-xs px-4 py-2 bg-green-600 rounded-xl hover:bg-green-700">تأیید</button>
                          <button onClick={() => updateStatus(honor.id, "rejected")} className="text-xs px-4 py-2 bg-red-600 rounded-xl hover:bg-red-700">رد</button>
                        </div>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button onClick={() => startEdit(honor)} className="text-xs px-4 py-1.5 bg-blue-600 rounded-xl">ویرایش</button>
                        <button onClick={() => deleteHonor(honor.id)} className="text-xs px-4 py-1.5 bg-red-600 rounded-xl">حذف</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
