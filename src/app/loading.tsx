import { RadarLoader } from "@/components/radar-loader";

export default function Loading() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-16">
      <RadarLoader
        size="lg"
        label="EventPilot Radar Active"
        sublabel="Scanning and loading live verified opportunities…"
      />
    </div>
  );
}
