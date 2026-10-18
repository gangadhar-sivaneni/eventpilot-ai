import type { NextConfig } from "next";

// Every page is per-user and reads the session cookie, so Cache Components
// would only add <Suspense> ceremony here. Turn on when a page has cacheable public data.
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(), // a stray package-lock.json higher up the disk must not become the root
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
