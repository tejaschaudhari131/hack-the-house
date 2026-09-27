import { readFile } from "node:fs/promises"
import path from "node:path"

/** Reads the committed files in web/public/data. next.config.mjs traces them into the API function. */
const DATA_DIR = path.join(process.cwd(), "public", "data")

async function readJson(name) {
  return JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8"))
}

let pending = null

export function loadServerData() {
  if (!pending) {
    pending = Promise.all([
      readJson("parcels.geojson"),
      readJson("zoning.json"),
      readJson("sources.json"),
      readJson("summary.json"),
      readJson("stops.geojson").catch(() => null),
    ])
      .then(([parcels, zoning, sources, summary, stops]) => {
        const byPin = new Map()
        for (const feature of parcels.features || []) byPin.set(feature.properties.pin, feature)
        return { byPin, zoning, sources, summary, stops }
      })
      .catch((error) => {
        pending = null
        throw error
      })
  }
  return pending
}
