import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// داده‌های موقت (در آینده از دیتابیس خوانده می‌شود)
let honors: any[] = [
  {
    id: 1,
    type: "winner",
    title: "قهرمان تورنومنت کالاف موبایل",
    description: "علی رضایی با عملکرد درخشان در فینال، عنوان قهرمانی را از آن خود کرد.",
    time: "۲ ساعت پیش",
    prize: "۵۰۰٬۰۰۰ تومان",
    username: "alireza_pro",
    highlight: true,
    status: "pending",
  },
];

export async function GET(req: NextRequest) {
  const { user } = await requireUser(req);
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(honors);
}

export async function PATCH(req: NextRequest) {
  const { user } = await requireUser(req);
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status } = await req.json();
  honors = honors.map((h) =>
    h.id === id ? { ...h, status } : h
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { user } = await requireUser(req);
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  honors = honors.filter((h) => h.id !== id);
  return NextResponse.json({ success: true });
}
