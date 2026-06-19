"use client";

import { useEffect, useState } from "react";

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
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          height: '100dvh',
          zIndex: -100,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
            backgroundImage: bgImage ? `url('${bgImage}')` : "url('/background.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
            willChange: 'transform',
          }}
        />
      </div>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -99,
          background: 'linear-gradient(180deg, rgba(15,15,26,0.2) 0%, rgba(15,15,26,0.1) 50%, rgba(15,15,26,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
