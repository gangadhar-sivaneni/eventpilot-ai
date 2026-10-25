import { RadarLoader } from "@/components/radar-loader";

export default function Loading() {
  return (
    <div className="shell flex min-h-[50vh] items-center justify-center py-16">
      <RadarLoader size="lg" />
    </div>
  );
}
