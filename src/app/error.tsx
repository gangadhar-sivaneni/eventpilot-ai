"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell grid min-h-[50vh] place-items-center py-20">
      <div role="alert" className="card max-w-lg p-8 text-center">
        <CircleAlert className="mx-auto h-10 w-10 text-bad" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-dim">{error.message && !error.digest ? error.message : "Please try again in a moment."}</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-faint">Ref {error.digest}</p>}
        <button className="btn btn-primary mt-6" onClick={reset}><RotateCcw aria-hidden="true" /> Try again</button>
      </div>
    </div>
  );
}
