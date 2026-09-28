// Opt-in diagnostic: build with NEXT_PUBLIC_MAP_BENCHMARK=1 and open
// /?pin=...&renderBenchmark=1&antialias=on (or off). Normal builds omit this UI.
// Measures delivered MapLibre render intervals, not GPU execution time.
export function attachMapBenchmark(map) {
  const panel = document.createElement('section'), output = document.createElement('pre')
  panel.setAttribute('aria-label', 'Map rendering benchmark')
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:410px;max-height:230px;overflow:auto;z-index:10000;background:white;color:#111;padding:12px;border:2px solid #23694f;font:12px monospace'
  output.setAttribute('aria-label', 'Map benchmark results')
  output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'
  const canvas = map.getCanvas(), gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info')
  const context = { antialias: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), userAgent: navigator.userAgent, pixelRatio: window.devicePixelRatio, canvas: [canvas.width, canvas.height] }
  const counts = () => ({ ...map.getContainer().dataset })
  const results = []
  let disposed = false, activeRender = null, taskObserver = null, cancelLeg = null
  const round = n => Math.round(n * 100) / 100
  const summarize = times => {
    const intervals = times.slice(1).map((t, i) => t - times[i]), sorted = [...intervals].sort((a, b) => a - b)
    if (!intervals.length) throw new Error('No rendered frames; keep this tab active during the run.')
    return { frames: times.length, fps: round(1000 * intervals.length / (times.at(-1) - times[0])), p50Ms: round(sorted[Math.floor(sorted.length * .5)]), p95Ms: round(sorted[Math.floor(sorted.length * .95)]), maxMs: round(sorted.at(-1)), over33MsPercent: round(100 * intervals.filter(t => t > 1000 / 30).length / intervals.length), over50Ms: intervals.filter(t => t > 50).length }
  }
  async function leg(camera) {
    if (disposed) throw new Error('Benchmark cancelled')
    await new Promise((resolve, reject) => {
      let timeout
      const finish = error => { clearTimeout(timeout); map.off('moveend', done); cancelLeg = null; error ? reject(error) : resolve() }
      const done = () => finish()
      cancelLeg = () => finish(new Error('Benchmark cancelled'))
      timeout = setTimeout(() => finish(new Error('Camera benchmark timed out')), 15000)
      map.on('moveend', done)
      map.easeTo({ ...camera, duration: 2000, easing: t => t, essential: true })
    })
  }
  async function orbit(center, zoom) {
    await leg({ center: [center.lng + .0004, center.lat + .00015], zoom, pitch: 55, bearing: 35 })
    await leg({ center: [center.lng - .0004, center.lat - .00015], zoom, pitch: 55, bearing: -60 })
    await leg({ center, zoom, pitch: 55, bearing: -25 })
  }
  async function run(zoom) {
    const buttons = [...panel.querySelectorAll('button')]
    buttons.forEach(button => { button.disabled = true })
    try {
      const center = map.getCenter()
      output.textContent = JSON.stringify({ context, status: 'Warming the same camera path…', zoom }, null, 2)
      map.jumpTo({ center, zoom, pitch: 55, bearing: -25 })
      await orbit(center, zoom)
      const runs = []
      for (let i = 0; i < 3; i++) {
        const times = [], longTasks = [], startCounts = counts()
        output.textContent = JSON.stringify({ context, status: `Measuring ${i + 1}/3…`, zoom }, null, 2)
        activeRender = () => times.push(performance.now())
        map.on('render', activeRender)
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
          taskObserver = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)))
          taskObserver.observe({ type: 'longtask' })
        }
        await orbit(center, zoom)
        map.off('render', activeRender); activeRender = null
        if (taskObserver) { longTasks.push(...taskObserver.takeRecords().map(e => e.duration)); taskObserver.disconnect(); taskObserver = null }
        runs.push({ ...summarize(times), longTasks: longTasks.length, longTaskMs: round(longTasks.reduce((sum, n) => sum + n, 0)), startCounts, endCounts: counts() })
      }
      results.push({ center, zoom, pitch: 55, runs })
      output.textContent = JSON.stringify({ context, status: 'Complete', results }, null, 2)
    } catch (error) { if (!disposed) output.textContent = `Benchmark failed: ${error.message}` }
    finally {
      if (activeRender) map.off('render', activeRender)
      activeRender = null; taskObserver?.disconnect(); taskObserver = null
      buttons.forEach(button => { button.disabled = false })
    }
  }
  for (const [label, zoom] of [['Run close camera benchmark', 17.6], ['Run wide camera benchmark', 16.2]]) {
    const button = document.createElement('button')
    button.textContent = label; button.style.cssText = 'padding:6px;margin:2px;border:1px solid #777'
    button.onclick = () => run(zoom); panel.append(button)
  }
  const zoomCheck = document.createElement('button')
  zoomCheck.textContent = 'Check zoom restoration'
  zoomCheck.onclick = async () => {
    const wait = async ms => { await new Promise(resolve => setTimeout(resolve, ms)); if (disposed) throw new Error('Benchmark cancelled') }
    const snapshot = async () => {
      await wait(400)
      for (let i = 0; i < 100 && (!map.loaded() || map.isMoving()); i++) await wait(100)
      if (!map.loaded() || map.isMoving()) throw new Error('Map did not settle')
      const data = await map.getSource('existing-buildings').getData()
      const rendered = [...new Set(map.queryRenderedFeatures({ layers: ['existing-buildings-fill', 'existing-buildings-overview'] }).map(f => f.properties.id))].sort()
      return { zoom: map.getZoom(), counts: counts(), sourceIds: data.features.map(f => f.properties.id).sort(), renderedIds: rendered }
    }
    const buttons = [...panel.querySelectorAll('button')]
    buttons.forEach(button => { button.disabled = true })
    try {
      const center = map.getCenter(), snapshots = [], overviews = []
      map.jumpTo({ center, zoom: 17.6, pitch: 55, bearing: -25 })
      snapshots.push(await snapshot())
      for (let cycle = 0; cycle < 4; cycle++) {
        output.textContent = JSON.stringify({ status: `Zoom cycle ${cycle + 1}/4…` })
        for (const zoom of [16.05, 15.95, 14.05, cycle % 2 ? 13 : 13.95, 15.95, 16.05, 17.6]) {
          map.jumpTo({ center, zoom, pitch: 55, bearing: -25 })
          await wait(180)
          if (zoom === 13) overviews.push(await snapshot())
        }
        snapshots.push(await snapshot())
      }
      output.textContent = JSON.stringify({ status: 'Zoom check complete', snapshots, overviews }, null, 2)
    } catch (error) { if (!disposed) output.textContent = error.message }
    finally { buttons.forEach(button => { button.disabled = false }) }
  }
  panel.append(zoomCheck)
  output.textContent = JSON.stringify({ context, status: 'Ready: finish loading, dismiss the tour, then run. Keep the tab active.' }, null, 2)
  panel.append(output); document.body.append(panel)
  return () => { disposed = true; cancelLeg?.(); if (activeRender) map.off('render', activeRender); taskObserver?.disconnect(); panel.remove() }
}
