import { fileURLToPath } from "node:url"
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
  outputFileTracingRoot: fileURLToPath(new URL("../", import.meta.url)),
  async headers() {
    return [{ source: '/data/studio/:file([a-z0-9-]+\\.[0-9a-f]{16}\\.json)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  },
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
      "../pipeline/data/processed/parcels/*.geojson.gz",
      "./public/data/studio/manifest.json",
      "./public/data/studio/pins-*.json",
      "./public/data/zoning.json",
      "./public/data/sources.json",
      "./public/data/summary.json",
      "./public/data/stops.geojson",
    ],
  },
  // These files are CDN-only. Dynamic JSON reads must not bundle every map
  // chunk into the explanation function; it uses the compressed sources.
  outputFileTracingExcludes: {
    "/api/explain": [
      "./public/data/studio/*-parcels.*.json",
      "./public/data/studio/*-buildings.*.json",
      "./public/data/studio/*-network.*.json",
      "./public/data/studio/*-roads.*.json",
    ],
  },
}

export default nextConfig
