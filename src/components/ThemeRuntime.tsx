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
      {/* بک‌گراند با متد dvh برای حذف لگ و فضای سفید در موبایل */}
      <div 
        id="fixed-bg"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: -100,
          backgroundImage: bgImage ? `url('${bgImage}')` : "url('/background.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />
      
      {/* گرادینت بسیار شفاف برای حفظ درخشش تصاویر */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: -99,
          background: 'linear-gradient(180deg, rgba(15,15,26,0.2) 0%, rgba(15,15,26,0.1) 50%, rgba(15,15,26,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
