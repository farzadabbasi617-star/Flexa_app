"use client";

/**
 * Animated 3D ZarinPal mark.
 *
 * Drawn as inline SVG rather than loaded as an image for three reasons:
 * it stays crisp at any size, it can be lit and layered for the 3D look, and
 * it costs no network request on a page that already carries the e-Namad seal.
 *
 * Deliberately NOT used for e-Namad: that seal must stay the real <img> served
 * from trustseal.enamad.ir with referrerPolicy="origin", because e-Namad checks
 * the Referer to verify the licence. A redrawn e-Namad badge would be both
 * broken and dishonest. Here there is nothing to verify — it is a payment
 * partner logo — so redrawing is safe.
 */

export default function ZarinpalMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="درگاه پرداخت زرین‌پال"
    >
      <defs>
        {/* Face lighting: brighter top-left, deeper bottom-right, so the tile
            reads as a lit surface instead of a flat rectangle. */}
        <linearGradient id="zp-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="45%" stopColor="#FFD400" />
          <stop offset="100%" stopColor="#E8A800" />
        </linearGradient>

        {/* The extruded side wall, darker than any part of the face. */}
        <linearGradient id="zp-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C98F00" />
          <stop offset="100%" stopColor="#8A5F00" />
        </linearGradient>

        <linearGradient id="zp-dot" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#3D6BFF" />
          <stop offset="100%" stopColor="#1435C4" />
        </linearGradient>

        {/* Sweeping specular band. Animated across the face on a long loop. */}
        <linearGradient id="zp-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        <clipPath id="zp-clip">
          <rect x="14" y="10" width="92" height="92" rx="22" />
        </clipPath>

        <filter id="zp-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Contact shadow on the ground plane. */}
      <ellipse cx="60" cy="110" rx="34" ry="5" fill="#000" opacity="0.38" filter="url(#zp-soft)" />

      {/* Extruded body: stacked offsets fake the depth of the tile. */}
      <g>
        <rect x="14" y="18" width="92" height="92" rx="22" fill="url(#zp-edge)" />
        <rect x="14" y="15" width="92" height="92" rx="22" fill="url(#zp-edge)" opacity="0.85" />
        <rect x="14" y="12.5" width="92" height="92" rx="22" fill="#B98400" />
      </g>

      {/* Lit face. */}
      <rect x="14" y="10" width="92" height="92" rx="22" fill="url(#zp-face)" />

      {/* Inner top highlight — the glassy edge of a raised surface. */}
      <rect
        x="18"
        y="14"
        width="84"
        height="84"
        rx="19"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />

      {/* Brand glyph: the blue node and the descending ribbon. */}
      <g>
        <path
          d="M45 34 h30 a6 6 0 0 1 5 9.3 L58 78 a6 6 0 0 1 -10.4 -6 L62 46 H45 a6 6 0 0 1 0 -12 z"
          fill="#fff"
          opacity="0.96"
        />
        <circle cx="47.5" cy="63" r="12.5" fill="url(#zp-dot)" />
        <circle cx="43.5" cy="58.5" r="4" fill="#fff" opacity="0.4" />
      </g>

      {/* Specular sweep, clipped to the tile so it never spills. */}
      <g clipPath="url(#zp-clip)">
        <rect x="-70" y="0" width="46" height="120" fill="url(#zp-shine)" transform="skewX(-18)">
          <animate
            attributeName="x"
            values="-70;150"
            dur="4.5s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4 0 0.2 1"
          />
        </rect>
      </g>
    </svg>
  );
}
