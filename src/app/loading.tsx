import { RadarLoader } from "@/components/radar-loader";

export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <RadarLoader size="md" />
    </div>
  );
}
