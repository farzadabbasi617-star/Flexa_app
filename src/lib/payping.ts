import logger from "@/lib/logger";

const PAYPING_API_BASE = "https://api.payping.ir/v2";
const PAYPING_GATEWAY_BASE = "https://api.payping.ir/v2/pay/gotoipg";

export type PayPingCreateInput = {
  amountToman: number;
  payerName?: string | null;
  payerIdentity?: string | null;
  description: string;
  returnUrl: string;
  clientRefId: string;
};

export type PayPingCreateResult = {
  code: string;
  paymentUrl: string;
};

function token() {
  const value = process.env.PAYPING_TOKEN?.trim();
  if (!value) throw new Error("PAYPING_TOKEN_MISSING");
  return value;
}

async function readPayPingResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function paypingErrorMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload.slice(0, 300) || fallback;
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const message = obj.message || obj.Message || obj.error || obj.Error;
    if (message) return String(message).slice(0, 300);
    const errors = obj.errors || obj.Errors;
    if (errors) return JSON.stringify(errors).slice(0, 300);
  }
  return fallback;
}

export function paypingCallbackUrl() {
  const explicit = process.env.PAYPING_CALLBACK_URL?.trim();
  if (explicit) return explicit;
  const appUrl = (process.env.APP_URL || "https://www.gament1.ir").replace(/\/$/, "");
  return `${appUrl}/api/payment/payping/callback`;
}

export async function createPayPingPayment(input: PayPingCreateInput): Promise<PayPingCreateResult> {
  const response = await fetch(`${PAYPING_API_BASE}/pay`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountToman,
      payerName: input.payerName || undefined,
      payerIdentity: input.payerIdentity || undefined,
      description: input.description,
      returnUrl: input.returnUrl,
      clientRefId: input.clientRefId,
    }),
    cache: "no-store",
  });

  const payload = await readPayPingResponse(response) as { code?: string } | unknown;
  if (!response.ok) {
    logger.warn({ status: response.status, payload }, "PayPing create payment failed");
    throw new Error(paypingErrorMessage(payload, "ساخت پرداخت پی‌پینگ انجام نشد."));
  }

  const code = typeof payload === "object" && payload && "code" in payload ? String((payload as { code?: string }).code || "") : "";
  if (!code) throw new Error("کد پرداخت از پی‌پینگ دریافت نشد.");

  return {
    code,
    paymentUrl: `${PAYPING_GATEWAY_BASE}/${encodeURIComponent(code)}`,
  };
}

export async function verifyPayPingPayment(input: { amountToman: number; refId: string }) {
  const response = await fetch(`${PAYPING_API_BASE}/pay/verify`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountToman,
      refId: input.refId,
    }),
    cache: "no-store",
  });

  const payload = await readPayPingResponse(response);
  if (!response.ok) {
    logger.warn({ status: response.status, payload, refId: input.refId }, "PayPing verify payment failed");
    throw new Error(paypingErrorMessage(payload, "تأیید پرداخت پی‌پینگ انجام نشد."));
  }

  return payload;
}
