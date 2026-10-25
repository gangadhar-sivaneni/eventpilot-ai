import React from "react";

interface RadarLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Retained for backwards-compatibility or screen-reader text */
  label?: string;
  sublabel?: string;
}

export function RadarLoader({
  size = "md",
  className = "",
  label = "Loading…",
}: RadarLoaderProps) {
  const sizeMap = {
    sm: {
      dial: "h-8 w-8",
      logo: "h-4 w-4",
    },
    md: {
      dial: "h-11 w-11",
      logo: "h-5 w-5",
    },
    lg: {
      dial: "h-14 w-14",
      logo: "h-7 w-7",
    },
  };

  const { dial, logo } = sizeMap[size];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center justify-center ${className}`}
    >
      <span className="sr-only">{label}</span>

      {/* Compact Outer Radar Dial */}
      <div
        className={`relative ${dial} aspect-square rounded-full border border-text/80 bg-[#14110f] p-0 shadow-[0_4px_16px_-2px_rgba(20,17,15,0.35)] overflow-hidden flex-none`}
      >
        {/* Background glow */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,90,31,0.3),transparent_70%)]" />

        {/* Concentric distance rings */}
        <div className="absolute inset-[18%] rounded-full border border-[#3d3630]/70 pointer-events-none" />
        <div className="absolute inset-[38%] rounded-full border border-[#3d3630]/70 pointer-events-none" />

        {/* Crosshair grid lines */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#3d3630]/80 pointer-events-none" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#3d3630]/80 pointer-events-none" />

        {/* High-speed sweeping radar beam */}
        <div className="sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(255,90,31,0.95),rgba(255,90,31,0.2)_55deg,transparent_75deg)] pointer-events-none" />

        {/* Animated radar blips */}
        <span
          className="ping blip absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal pointer-events-none"
          style={{ left: "72%", top: "30%", animationDelay: "0s" }}
        />
        <span
          className="ping blip absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#faf6f0] pointer-events-none"
          style={{ left: "28%", top: "68%", animationDelay: "0.9s" }}
        />

        {/* Center EventPilot Logo Symbol */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3d3630] bg-[#14110f] p-0.5 shadow-[0_0_8px_rgba(255,90,31,0.7)] flex items-center justify-center">
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
    </div>
  );
}
