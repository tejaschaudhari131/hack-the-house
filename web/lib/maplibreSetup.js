import { setWorkerUrl } from 'maplibre-gl'

export function configureMapWorkers() {
  setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs')
}
