// Demo mode is on while .env.local still holds the placeholder Supabase URL (or NEXT_PUBLIC_DEMO=1).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const DEMO =
  process.env.NEXT_PUBLIC_DEMO === "1" || !url || url.includes("YOUR-PROJECT-REF") || url.includes("placeholder");
