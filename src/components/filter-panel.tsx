"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

// Filters are always visible on large screens; on phones they fold behind one button.
export function FilterPanel({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost w-full lg:hidden"
        aria-expanded={open}
        aria-controls="filters"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden="true" /> {open ? "Hide filters" : "Filters"}
        {active > 0 && <span className="pill pill-signal">{active}</span>}
      </button>
      <div id="filters" className={`${open ? "block" : "hidden"} mt-3 lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
}
