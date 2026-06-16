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
}

export default function AdminHonorsPage() {
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black">تالار افتخارات</h1>
            <p className="text-sm text-gray-400 mt-1">مدیریت محتوا + تأیید پیشنهادات هوش مصنوعی</p>
          </div>
          <Link href="/admin" className="text-sm text-purple-400">← بازگشت به پنل</Link>
        </div>

        {loading ? (
          <div className="text-center py-20">در حال بارگذاری...</div>
        ) : (
          <div className="space-y-4">
            {honors.length === 0 && (
              <div className="text-center py-12 text-gray-500">هنوز محتوایی ثبت نشده است.</div>
            )}

            {honors.map((honor) => (
              <div key={honor.id} className="glass-panel p-6 rounded-3xl border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-black text-xl mb-1">{honor.title}</div>
                    <p className="text-sm text-white/80 mb-3">{honor.description}</p>
                    <div className="text-xs text-gray-500">
                      {honor.username && `@${honor.username} • `}
                      {honor.time}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className={`text-xs px-3 py-1 rounded-full border ${
                      honor.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                      honor.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                    }`}>
                      {honor.status === "approved" ? "تأیید شده" : honor.status === "rejected" ? "رد شده" : "در انتظار تأیید"}
                    </div>

                    {honor.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(honor.id, "approved")}
                          className="text-xs px-4 py-2 bg-green-600 rounded-xl hover:bg-green-700"
                        >
                          تأیید و انتشار
                        </button>
                        <button
                          onClick={() => updateStatus(honor.id, "rejected")}
                          className="text-xs px-4 py-2 bg-red-600 rounded-xl hover:bg-red-700"
                        >
                          رد
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => deleteHonor(honor.id)}
                      className="text-xs text-red-400 hover:text-red-500 mt-1"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
