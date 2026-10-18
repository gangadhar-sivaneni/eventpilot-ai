"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// <details> dropdown that also closes on navigation, outside click and Escape.
export function Menu({ summary, label, children }: { summary: React.ReactNode; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary aria-label={label} className="list-none">{summary}</summary>
      <div className="absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-[0_24px_60px_-20px_var(--shadow)] [animation:rise_180ms_var(--ease-out)_both]">
        {children}
      </div>
    </details>
  );
}
