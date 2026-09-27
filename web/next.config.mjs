/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
