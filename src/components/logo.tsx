import Link from "next/link";

// Mark: a black radar dial with an orange sweep and one found "blip" (the agent spotting an event).
export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="EventPilot home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#14110f" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="#3d3630" />
        <path d="M16 16 L16 1 A15 15 0 0 1 29.6 9.8 Z" fill="#ff5a1f"
          className="transition-transform duration-700 group-hover:rotate-[120deg]" style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }} />
        <circle cx="21.5" cy="20.5" r="2.2" fill="#faf6f0" />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight">
        Event<span className="text-accent">Pilot</span>
      </span>
    </Link>
  );
}
