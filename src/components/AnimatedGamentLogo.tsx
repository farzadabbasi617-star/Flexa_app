type AnimatedGamentLogoProps = {
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "w-24 h-24",
  md: "w-32 h-32",
  lg: "w-40 h-40",
};

export default function AnimatedGamentLogo({ size = "md", showLabel = false, className = "" }: AnimatedGamentLogoProps) {
  return (
    <div className={`gament-logo-wrap ${className}`}>
      <div className={`gament-logo-stage ${sizeClasses[size]}`} aria-label="Gament animated logo">
        <span className="gament-orbit gament-orbit-a" />
        <span className="gament-orbit gament-orbit-b" />
        <span className="gament-spark spark-1" />
        <span className="gament-spark spark-2" />
        <span className="gament-spark spark-3" />
        <span className="gament-scan" />
        <img src="/icons/gament-icon-512.png" alt="Gament | گیمنت" className="gament-logo-img" />
      </div>

      {showLabel && (
        <div className="mt-3 text-center">
          <div className="text-lg font-black tracking-tight text-white">Gament | گیمنت</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300/80">Gaming Arena</div>
        </div>
      )}

      <style jsx>{`
        .gament-logo-wrap {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          isolation: isolate;
        }

        .gament-logo-stage {
          position: relative;
          border-radius: 32%;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 52% 42%, rgba(168, 85, 247, 0.18), transparent 42%),
            radial-gradient(circle at 70% 35%, rgba(34, 211, 238, 0.16), transparent 44%),
            linear-gradient(135deg, rgba(8, 10, 18, 0.98), rgba(20, 8, 34, 0.82));
          box-shadow:
            0 0 26px rgba(168, 85, 247, 0.45),
            0 0 52px rgba(34, 211, 238, 0.2),
            inset 0 0 24px rgba(255, 255, 255, 0.05);
          animation: gament-float 4.5s ease-in-out infinite;
          overflow: hidden;
        }

        .gament-logo-stage::before {
          content: "";
          position: absolute;
          inset: -18%;
          background: conic-gradient(
            from 0deg,
            transparent,
            rgba(168, 85, 247, 0.72),
            rgba(34, 211, 238, 0.8),
            rgba(250, 204, 21, 0.55),
            transparent 72%
          );
          filter: blur(10px);
          opacity: 0.75;
          animation: gament-spin 6s linear infinite;
          z-index: -2;
        }

        .gament-logo-stage::after {
          content: "";
          position: absolute;
          inset: 7%;
          border-radius: 30%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 0 18px rgba(34, 211, 238, 0.18);
          pointer-events: none;
          z-index: 3;
        }

        .gament-logo-img {
          width: 96%;
          height: 96%;
          object-fit: cover;
          border-radius: 30%;
          filter:
            drop-shadow(0 0 12px rgba(168, 85, 247, 0.85))
            drop-shadow(0 0 18px rgba(34, 211, 238, 0.55));
          transform: translateZ(0);
          animation: gament-pulse 2.8s ease-in-out infinite;
          z-index: 2;
        }

        .gament-orbit {
          position: absolute;
          inset: -8%;
          border-radius: 34%;
          border: 1px solid transparent;
          pointer-events: none;
          z-index: 1;
        }

        .gament-orbit-a {
          border-top-color: rgba(34, 211, 238, 0.75);
          border-right-color: rgba(168, 85, 247, 0.42);
          animation: gament-orbit 4.2s linear infinite;
        }

        .gament-orbit-b {
          inset: 2%;
          border-bottom-color: rgba(250, 204, 21, 0.55);
          border-left-color: rgba(236, 72, 153, 0.5);
          animation: gament-orbit 5.4s linear infinite reverse;
        }

        .gament-scan {
          position: absolute;
          left: -40%;
          right: -40%;
          top: -18%;
          height: 36%;
          background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.16), transparent);
          transform: rotate(-18deg);
          mix-blend-mode: screen;
          animation: gament-scan 3.6s ease-in-out infinite;
          z-index: 4;
          pointer-events: none;
        }

        .gament-spark {
          position: absolute;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #facc15;
          box-shadow: 0 0 12px #facc15, 0 0 22px rgba(34, 211, 238, 0.7);
          z-index: 5;
          opacity: 0;
        }

        .spark-1 { top: 11%; left: 29%; animation: gament-spark 2.8s ease-in-out infinite; }
        .spark-2 { top: 17%; right: 22%; animation: gament-spark 2.8s ease-in-out 0.65s infinite; }
        .spark-3 { bottom: 20%; left: 42%; animation: gament-spark 2.8s ease-in-out 1.25s infinite; }

        @keyframes gament-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-7px) scale(1.025); }
        }

        @keyframes gament-pulse {
          0%, 100% { filter: drop-shadow(0 0 11px rgba(168, 85, 247, 0.75)) drop-shadow(0 0 18px rgba(34, 211, 238, 0.45)); }
          50% { filter: drop-shadow(0 0 20px rgba(168, 85, 247, 1)) drop-shadow(0 0 30px rgba(34, 211, 238, 0.75)); }
        }

        @keyframes gament-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes gament-orbit {
          to { transform: rotate(360deg); }
        }

        @keyframes gament-scan {
          0%, 18% { transform: translateY(-160%) rotate(-18deg); opacity: 0; }
          35%, 60% { opacity: 1; }
          82%, 100% { transform: translateY(410%) rotate(-18deg); opacity: 0; }
        }

        @keyframes gament-spark {
          0%, 100% { opacity: 0; transform: scale(0.2); }
          45% { opacity: 1; transform: scale(1); }
          70% { opacity: 0; transform: scale(1.8); }
        }
      `}</style>
    </div>
  );
}
