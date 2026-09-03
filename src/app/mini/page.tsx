import { redirect } from "next/navigation";

/**
 * /mini حالا فقط ورودی استاتیک /mini.html را نشانی می‌کند —
 * نسخه React این صفحه به‌خاطر سنگینی پوسته اپ روی WebView تلگرام
 * گوشی‌های ضعیف کرش می‌کرد؛ نسخه استاتیک چند کیلوبایتی جایگزین شد.
 */
export default function MiniRedirect() {
  redirect("/mini.html");
}
