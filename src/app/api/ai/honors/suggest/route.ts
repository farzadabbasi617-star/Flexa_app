import { NextRequest, NextResponse } from "next/server";

// این API توسط هوش مصنوعی (یا سیستم داخلی) فراخوانی می‌شود
export async function POST(req: NextRequest) {
  const body = await req.json();

  // در آینده: بررسی کلید API یا توکن هوش مصنوعی

  const newHonor = {
    id: Date.now(),
    type: body.type || "news",
    title: body.title,
    description: body.description,
    time: "همین الان",
    prize: body.prize,
    username: body.username,
    level: body.level,
    highlight: body.highlight || false,
    status: "pending", // همیشه در انتظار تأیید مدیر
  };

  // در آینده این را در دیتابیس ذخیره می‌کنیم
  // فعلاً فقط لاگ می‌کنیم
  console.log("AI suggested new honor:", newHonor);

  return NextResponse.json({
    success: true,
    message: "پیشنهاد هوش مصنوعی ثبت شد و در انتظار تأیید مدیر است.",
    honor: newHonor,
  });
}
