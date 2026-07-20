import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.telegram.org https://openrouter.ai https://api.groq.com https://router.huggingface.co https://api.resend.com https://script.google.com https://script.googleusercontent.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Playwright's local server is reached through 127.0.0.1 during development.
  allowedDevOrigins: ["127.0.0.1"],

  // فشرده‌سازی
  compress: true,

  // Keep production builds inside Render Free's memory budget. Running the
  // webpack compiler in-process avoids duplicating the full module graph in a
  // worker, while the memory-optimized graph trades a little speed for a much
  // lower peak RSS.
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
  },
  // Type checking already runs as a mandatory CI job (`npm run typecheck`).
  // Skipping Next's duplicate checker prevents two large TypeScript processes
  // from exceeding the memory limit during the Render production build.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Webpack otherwise schedules a very large number of module builds at once.
  // A small queue is slower but keeps both Arena and Render Free below their
  // memory limit, avoiding an abrupt SIGKILL during production deploys.
  webpack(config) {
    config.parallelism = 1;
    return config;
  },
  // Development and Playwright use Next 16's default Turbopack server. An
  // explicit empty config confirms that the webpack override above is only
  // intended for `next build --webpack` and prevents the dev server exiting.
  turbopack: {},

  // بهینه‌سازی تصاویر
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    deviceSizes: [390, 768, 1024, 1280, 1920],
  },

  async headers() {
    return [
      // هدرهای امنیتی برای همه مسیرها
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Next.js automatically serves hashed /_next/static assets as immutable;
      // overriding that Cache-Control header causes framework warnings and can
      // break development caching, so only the global security headers apply.
      // آیکون‌ها — کش یه روزه (نه بلندمدت تا لوگو گیر نکنه)
      {
        source: "/icons/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=86400, must-revalidate" },
        ],
      },
      // manifest
      {
        source: "/manifest.json",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
      // service worker — هرگز کش نشه
      {
        source: "/sw.js",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // تصاویر عمومی
      {
        source: "/avatars/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      // صفحات HTML — کش کوتاه با revalidate
      {
        source: "/((?!_next|api|icons|avatars|manifest|sw).*)",
        headers: [
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
