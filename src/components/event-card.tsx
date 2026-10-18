import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import type { EventRow } from "@/lib/events";
import { LocalTime } from "@/components/local-time";
import { FeePill, PlacePill, PrizePill, StatusPill } from "@/components/ui";

export function EventCard({ e, i = 0 }: { e: EventRow; i?: number }) {
  return (
    <article className="rise card card-hover group relative flex h-full flex-col p-5" style={{ "--i": i % 12 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={e.registration_status} />
        <FeePill e={e} />
        <span className="ml-auto font-mono text-[0.68rem] text-faint">{e.event_sources?.name ?? "Unknown source"}</span>
      </div>
      <h3 className="mt-4 line-clamp-2 text-xl font-semibold leading-snug">
        <Link href={`/events/${e.id}`} className="after:absolute after:inset-0 after:rounded-[1.1rem] focus-visible:outline-none">
          {e.title}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-1 text-sm text-faint">{e.organizer ?? "Organizer not listed"}</p>
      <div className="mt-3"><PlacePill e={e} /></div>
      <div className="mt-auto flex items-center gap-3 pt-5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-dim">
          <Clock className="h-4 w-4 flex-none text-faint" aria-hidden="true" />
          {e.registration_deadline ? <>Closes&nbsp;<LocalTime iso={e.registration_deadline} relative /></> : "Deadline not announced"}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          <PrizePill prize={e.prize_text} />
          <ArrowUpRight className="h-5 w-5 flex-none text-faint transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}
