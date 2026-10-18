// Skeleton that mirrors the page header + card grid, so nothing jumps when content arrives.
export default function Loading() {
  return (
    <div className="shell py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-4 h-10 w-72 max-w-full" />
      <div className="skeleton mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-44" />)}
      </div>
    </div>
  );
}
