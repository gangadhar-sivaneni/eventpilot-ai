import Link from "next/link";
import { Radar } from "lucide-react";

export default function NotFound() {
  return (
    <div className="shell grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <Radar className="mx-auto h-12 w-12 text-accent" aria-hidden="true" />
        <p className="eyebrow mt-6">404</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Off the radar.</h1>
        <p className="mx-auto mt-3 max-w-md text-dim">This page or event does not exist, or it was removed from the source.</p>
        <Link href="/events" className="btn btn-primary mt-8">Browse events</Link>
      </div>
    </div>
  );
}
