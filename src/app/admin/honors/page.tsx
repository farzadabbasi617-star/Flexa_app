"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface Honor {
  id: number;
  type: "winner" | "levelup" | "news";
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight: boolean;
  status: "pending" | "approved" | "rejected";
  image?: string;
}

export default function AdminHonorsPage() {
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHonor, setNewHonor] = useState({
    type: "news" as const,
    title: "",
    description: "",
    prize: "",
    username: "",
    level: "",
    highlight: false,
    image: "",
  });

  const fetchHonors = async () => {
    const res = await fetch("/api/admin/honors");
    const data = await res.json();
    setHonors(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchHonors();
  }, []);

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    await fetch("/api/admin/honors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchHonors();
  };

  const deleteHonor = async (id: number) => {
    if (!confirm("حذف شود؟")) return;
    await fetch("/api/admin/honors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchHonors();
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setNewHonor({
      type: "news",
      title: "",
      description: "",
      prize: "",
      username: "",
      level: "",
      highlight: false,
      image: "",
    });

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
          <Link href="/admin" className="text-sm text-purple-400">← بازگشت به پنل</Link>
        </div>

        {/* فرم ایجاد محتوا */}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input placeholder="نام کاربری" value={newHonor.username} onChange={(e) => setNewHonor({...newHonor, username: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="جایزه (اختیاری)" value={newHonor.prize} onChange={(e) => setNewHonor({...newHonor, prize: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="لول (اختیاری)" value={newHonor.level} onChange={(e) => setNewHonor({...newHonor, level: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
          </div>

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

          <button 
            onClick={createHonor} 
            className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-2xl text-sm font-black transition-all"
          >
            ایجاد محتوا
          </button>
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
                <div className="flex justify-between gap-6">
                  <div className="flex-1">
                    <div className="font-black text-xl mb-1.5">{honor.title}</div>
                    <p className="text-sm text-white/80 mb-4 leading-relaxed">{honor.description}</p>
                    
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                      {honor.username && <span>@{honor.username}</span>}
                      {honor.level && <span>سطح {honor.level}</span>}
                      {honor.prize && <span className="text-yellow-400">{honor.prize}</span>}
                      <span>{honor.time}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 min-w-[140px]">
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

                    <button onClick={() => deleteHonor(honor.id)} className="text-xs text-red-400 hover:text-red-500 mt-1">حذف</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
