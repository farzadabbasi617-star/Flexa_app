import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { affiliateProgramLive, affiliatePublicLink, createPersonalReferralAccount, getMediaPartnerDashboard, redactSheba, updatePersonalReferralSheba } from "@/lib/affiliate-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function publicData(data: Awaited<ReturnType<typeof getMediaPartnerDashboard>>) {
  if (!data.partner) return { ...data, live: affiliateProgramLive() };
  return {
    ...data,
    partner: {
      ...data.partner,
      nationalId: `${data.partner.nationalId.slice(0, 3)}••••${data.partner.nationalId.slice(-3)}`,
      sheba: redactSheba(data.partner.sheba),
      referralLink: data.partner.status === "active" ? affiliatePublicLink(data.partner.referralCode) : null,
    },
    live: affiliateProgramLive(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(publicData(await getMediaPartnerDashboard(auth.user.id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Personal referral dashboard GET failed");
    return NextResponse.json({ error: "اطلاعات طرح معرفی دریافت نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`personal-referral-start:${auth.user.id}:${ip}`, 4, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    const [user] = await db.select({ displayName: users.displayName, firstName: users.firstName, lastName: users.lastName, nationalId: users.nationalId, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (!user?.nationalId) return NextResponse.json({ error: "برای فعال‌سازی معرفی، اطلاعات هویتی و کد ملی را از تب پروفایل تکمیل کنید", redirect: "/profile/user" }, { status: 403 });
    if (!user.email || !user.emailVerifiedAt) return NextResponse.json({ error: "ایمیل حساب باید تأیید شده باشد" }, { status: 403 });
    const legalName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.displayName;
    const result = await createPersonalReferralAccount({ userId: auth.user.id, displayName: legalName, nationalId: user.nationalId });
    if (!result.created && result.reason === "media_partner_exists") {
      return NextResponse.json({ error: "حساب شما قبلاً به‌عنوان شریک رسانه‌ای ثبت شده و از همان لینک استفاده می‌کند", redirect: "/media-partners" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: result.partner?.status || "draft" }, { status: result.created ? 201 : 200 });
  } catch (error) {
    logger.error({ error }, "Personal referral activation POST failed");
    return NextResponse.json({ error: "شروع طرح معرفی انجام نشد" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const result = await updatePersonalReferralSheba(auth.user.id, String(body.sheba || ""));
    if (!result.updated) return NextResponse.json({ error: result.reason === "invalid_sheba" ? "شماره شبای معتبر وارد کنید" : "حساب معرفی فعال نیست" }, { status: 400 });
    return NextResponse.json({ ok: true, sheba: redactSheba(result.partner.sheba) });
  } catch (error) {
    logger.error({ error }, "Personal referral sheba PATCH failed");
    return NextResponse.json({ error: "ثبت شماره شبا انجام نشد" }, { status: 500 });
  }
}
