import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { sourceName, type EventRow } from "@/lib/events";
import { LocalTime } from "@/components/local-time";
import { FeePill, PlacePill, PrizePill, StatusPill } from "@/components/ui";

export function EventCard({ e, i = 0 }: { e: EventRow; i?: number }) {
  return (
    <article
      className="rise card card-hover group relative flex h-full flex-col overflow-hidden p-4 sm:p-5"
      style={{ "--i": i % 12 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={e.registration_status} />
        <FeePill e={e} />
        <span className="ml-auto font-mono text-[0.68rem] font-medium text-accent">{sourceName(e)}</span>
      </div>
      <h3 className="mt-3.5 sm:mt-4 line-clamp-2 text-lg sm:text-xl font-semibold leading-snug">
        <Link href={`/events/${e.id}`} className="after:absolute after:inset-0 after:rounded-[1.1rem] focus-visible:outline-none">
          {e.title}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-1 text-xs sm:text-sm text-faint">{e.organizer ?? "Organizer not listed"}</p>
      <div className="mt-2.5 sm:mt-3"><PlacePill e={e} /></div>
      <div className="mt-auto flex w-full items-center justify-between gap-2 pt-4 border-t border-line/40">
        <div className="flex shrink-0 items-center gap-1.5 text-xs sm:text-sm text-dim whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-faint" aria-hidden="true" />
          <span className="whitespace-nowrap">
            {e.registration_deadline ? <>Closes&nbsp;<LocalTime iso={e.registration_deadline} relative /></> : "Deadline TBA"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PrizePill prize={e.prize_text} />
          <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center text-faint transition-colors group-hover:text-accent">
            <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  );
}
