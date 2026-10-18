// Decorative radar: a black dial with an orange sweep and pinging blips. Pure CSS, frozen under reduced motion.
const BLIPS = [
  { x: 68, y: 30, d: "0s", c: "bg-signal" },
  { x: 28, y: 62, d: "1.2s", c: "bg-[#faf6f0]" },
  { x: 58, y: 74, d: "2.1s", c: "bg-signal" },
  { x: 36, y: 26, d: "3.3s", c: "bg-[#faf6f0]" },
];

export function Radar() {
  return (
    <div aria-hidden="true" className="on-dark relative aspect-square w-full rounded-full shadow-[0_40px_80px_-30px_rgb(20_17_15/0.55)]">
      <div className="absolute inset-0 rounded-full border border-line bg-[radial-gradient(circle,rgb(255_90_31/0.16),transparent_65%)]" />
      {[0.72, 0.46, 0.2].map((s) => (
        <div key={s} className="absolute rounded-full border border-line" style={{ inset: `${(1 - s) * 50}%` }} />
      ))}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-line" />
        <div className="sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgb(255_90_31/0.55),rgb(255_90_31/0.08)_55deg,transparent_70deg)]" />
      </div>
      {BLIPS.map((b) => (
        <span
          key={b.x}
          className={`ping blip absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${b.c}`}
          style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: b.d }}
        />
      ))}
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_24px_rgb(255_90_31/0.9)]" />
    </div>
  );
}
