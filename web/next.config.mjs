import { execSync } from "node:child_process"

function commitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return ""
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // Explorer links created before Studio became the home page keep their scenario.
    return [{ source: "/", has: [{ type: "query", key: "s" }], destination: "/explore", permanent: false }]
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha().slice(0, 12),
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
  outputFileTracingIncludes: {
    "/api/explain": [
      "./public/data/parcels.geojson",
      "./public/data/zoning.json",
      "./public/data/sources.json",
      "./public/data/summary.json",
      "./public/data/stops.geojson",
    ],
  },
}

export default nextConfig
