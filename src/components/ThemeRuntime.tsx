"use client";

import { useEffect, useState } from "react";

interface BackgroundImage {
  url: string;
}

export default function ThemeRuntime() {
  const [bgImage, setBgImage] = useState<string | null>(null);

  useEffect(() => {
    async function loadBackground() {
      try {
        const res = await fetch("/api/public/background", { cache: "no-store" });
        const data = await res.json();
        
        if (data?.url) {
          setBgImage(data.url);
          // Add class for transparent pages
          document.documentElement.classList.add("show-bg-image");
        } else {
          setBgImage(null);
          document.documentElement.classList.remove("show-bg-image");
        }
      } catch {
        document.documentElement.classList.remove("show-bg-image");
      }
    }

    loadBackground();
  }, []);

  return (
    <>
      {/* بک‌گراند با روش جدید - فیکس و بدون لگ */}
      <div 
        id="fixed-bg"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -100,
          backgroundImage: bgImage ? `url('${bgImage}')` : "url('/background.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          // transform trick for mobile fixed background
          transform: 'translateZ(0)',
          willChange: 'transform',
          // Disable pointer events
          pointerEvents: 'none',
        }}
      />
      
      {/* گرادیان روی بک‌گراند */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -99,
          background: 'linear-gradient(180deg, rgba(5,5,16,0.3) 0%, rgba(5,5,16,0.1) 40%, rgba(5,5,16,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
