import React from "react";

interface RadarLoaderProps {
  label?: string;
  sublabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RadarLoader({
  label = "Signing you in…",
  sublabel = "Preparing your verified events dashboard",
  size = "md",
  className = "",
}: RadarLoaderProps) {
  const sizeMap = {
    sm: {
      dial: "h-24 w-24",
      logo: "h-8 w-8",
      text: "text-base",
      sub: "text-xs",
    },
    md: {
      dial: "h-36 w-36",
      logo: "h-12 w-12",
      text: "text-lg",
      sub: "text-xs",
    },
    lg: {
      dial: "h-48 w-48 sm:h-56 sm:w-56",
      logo: "h-16 w-16",
      text: "text-xl sm:text-2xl",
      sub: "text-sm",
    },
  };

  const { dial, logo, text, sub } = sizeMap[size];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center py-6 ${className}`}
    >
      <span className="sr-only">{label}</span>

      {/* Outer Radar Dial */}
      <div className={`relative ${dial} aspect-square rounded-full border-2 border-text bg-[#14110f] p-0 shadow-[0_12px_36px_-10px_rgba(20,17,15,0.45)] overflow-hidden`}>
        {/* Background glow */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,90,31,0.2),transparent_70%)]" />

        {/* Concentric distance rings */}
        <div className="absolute inset-[15%] rounded-full border border-[#3d3630]/60" />
        <div className="absolute inset-[32%] rounded-full border border-[#3d3630]/60" />
        <div className="absolute inset-[48%] rounded-full border border-[#3d3630]/60" />

        {/* Crosshair grid lines */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#3d3630]/70" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#3d3630]/70" />

        {/* High-speed sweeping radar beam */}
        <div className="sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(255,90,31,0.75),rgba(255,90,31,0.12)_60deg,transparent_75deg)]" />

        {/* Animated radar blips */}
        <span
          className="ping blip absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
          style={{ left: "70%", top: "32%", animationDelay: "0s" }}
        />
        <span
          className="ping blip absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#faf6f0]"
          style={{ left: "30%", top: "66%", animationDelay: "1s" }}
        />
        <span
          className="ping blip absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
          style={{ left: "62%", top: "72%", animationDelay: "1.8s" }}
        />

        {/* Center Logo Symbol */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3d3630] bg-[#14110f] p-1 shadow-[0_0_16px_rgba(255,90,31,0.6)]">
          <svg viewBox="0 0 32 32" className={logo} aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#14110f" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="#3d3630" />
            <path
              d="M16 16 L16 1 A15 15 0 0 1 29.6 9.8 Z"
              fill="#ff5a1f"
              className="animate-spin duration-1000"
              style={{ transformOrigin: "16px 16px" }}
            />
            <circle cx="21.5" cy="20.5" r="2.2" fill="#faf6f0" />
          </svg>
        </div>
      </div>

      {/* Text Feedback */}
      <div className="mt-5 space-y-1">
        <div className="flex items-center justify-center gap-2">
          <span className="ping relative h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
          <h3 className={`font-display font-extrabold tracking-tight text-text ${text}`}>
            {label}
          </h3>
        </div>
        {sublabel && (
          <p className={`text-dim max-w-xs ${sub}`}>
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}
