import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_DIRECT_IMAGE_SIZE = 650 * 1024;
const MAX_CLOUD_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_CLOUD_VIDEO_SIZE = 45 * 1024 * 1024;
const ALLOWED_PURPOSES = new Set(["evidence", "report"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function signCloudinary(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(payload + secret).digest("hex");
}

function safeRoomSegment(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return /^[0-9a-f-]{36}$/i.test(text) ? text : "unassigned";
}

function resourceKind(mime: string) {
  if (ALLOWED_IMAGE_TYPES.has(mime)) return "image" as const;
  if (ALLOWED_VIDEO_TYPES.has(mime)) return "video" as const;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`cod:upload:${user.id}:${ip}`, 25, 60 * 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "تعداد آپلودها زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") || "evidence");
    if (!ALLOWED_PURPOSES.has(purpose)) return NextResponse.json({ error: "نوع آپلود معتبر نیست" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "فایلی انتخاب نشده است" }, { status: 400 });

    const kind = resourceKind(file.type);
    if (!kind) return NextResponse.json({ error: "فقط تصویر یا ویدیوی معتبر مجاز است" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const roomId = safeRoomSegment(form.get("roomId"));
    const folder = `gament/cod-${purpose}/${roomId}/${user.id}`;

    if (hasCloudinaryConfig()) {
      const max = kind === "image" ? MAX_CLOUD_IMAGE_SIZE : MAX_CLOUD_VIDEO_SIZE;
      if (bytes.length > max) {
        return NextResponse.json({
          error: kind === "image"
            ? "حجم تصویر بیش از حد مجاز است (حداکثر ۱۰ مگابایت)"
            : "حجم ویدیو بیش از حد مجاز است (حداکثر ۴۵ مگابایت)",
        }, { status: 400 });
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
      const apiKey = process.env.CLOUDINARY_API_KEY!;
      const apiSecret = process.env.CLOUDINARY_API_SECRET!;
      const params = { folder, timestamp };
      const signature = signCloudinary(params, apiSecret);

      const uploadForm = new FormData();
      uploadForm.append("file", new Blob([bytes], { type: file.type }), file.name || `cod-${purpose}`);
      uploadForm.append("api_key", apiKey);
      uploadForm.append("timestamp", timestamp);
      uploadForm.append("folder", folder);
      uploadForm.append("signature", signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: uploadForm,
      });
      const data = await response.json();
      if (!response.ok) return NextResponse.json({ error: data.error?.message || "آپلود ناموفق بود" }, { status: 400 });

      return NextResponse.json({
        url: data.secure_url,
        provider: "cloudinary",
        publicId: data.public_id,
        contentHash,
        resourceType: data.resource_type || kind,
        bytes: bytes.length,
      }, { status: 201 });
    }

    if (kind !== "image") {
      return NextResponse.json({
        error: "آپلود مستقیم ویدیو نیاز به Cloudinary دارد. فعلاً لینک HTTPS ویدیو را در بخش مدرک وارد کن.",
      }, { status: 400 });
    }
    if (bytes.length > MAX_DIRECT_IMAGE_SIZE) {
      return NextResponse.json({
        error: "بدون Cloudinary فقط تصویر کمتر از ۶۵۰ کیلوبایت قابل آپلود مستقیم است. تصویر را کوچک‌تر کن یا لینک HTTPS بده.",
      }, { status: 400 });
    }

    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    return NextResponse.json({
      url: dataUrl,
      provider: "data-url",
      contentHash,
      resourceType: kind,
      bytes: bytes.length,
    }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "COD evidence upload failed");
    return NextResponse.json({ error: "خطا در آپلود مدرک" }, { status: 500 });
  }
}
