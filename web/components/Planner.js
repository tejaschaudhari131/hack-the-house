"use client"

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import { slimParcels } from '../lib/plannerGeometry.js'
import { evaluatePlanner, nearbyStops, preferredStop, round } from '../lib/plannerModel.js'
import { EXAMPLES, MODEL_VERSION, PLANNER_FACTORS, MASSING_DEFAULTS, initialScenario, historyFor, scenarioReducer, scenarioExport } from '../lib/plannerState.js'

const PlannerMap = dynamic(() => import('./PlannerMap.js'), { ssr: false, loading: () => <div className="planner-loading">Preparing the map…</div> })
const fmt = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value) ? `${round(value).toLocaleString()}${suffix}` : 'Unknown'
const cash = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

function Icon({ name, size = 20 }) {
  const paths = {
    building: <><path d="M4 21V8l8-5 8 5v13M2 21h20M9 21v-6h6v6"/><path d="M8 9h1m6 0h1M8 12h1m6 0h1"/></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1"/></>,
    chart: <><path d="M4 3v17h17M8 15V9m5 6V5m5 10v-4"/></>,
    layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></>,
    undo: <><path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    pin: <><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.building}</svg>
}

function Numeric({ label, value, onChange, min = 0, max = 100000, step = 1, hint, nullable = false }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  function commit() {
    if (draft === '' && nullable) { onChange(null); return }
    const n = Number(draft)
    if (draft !== '' && Number.isFinite(n)) { const next = Math.min(max, Math.max(min, n)); setDraft(next); onChange(next) }
    else setDraft(value ?? '')
  }
  return <label className="planner-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder={nullable ? 'Unknown' : undefined} />{hint && <small>{hint}</small>}</label>
}

function useEvaluation(input) {
  const worker = useRef(null), latest = useRef(0), current = useRef(input)
  const [state, setState] = useState({ result: null, pending: true, error: null })
  current.current = input
  useEffect(() => {
    let w
    try {
      w = new Worker(new URL('../workers/planner.worker.js', import.meta.url), { type: 'module' })
      worker.current = w
      w.onmessage = ({ data }) => {
        if (data.revision !== latest.current) return
        setState({ result: data.result || null, pending: false, error: data.error || null, pin: current.current.feature.properties.pin })
      }
      w.onerror = () => {
        w.terminate(); worker.current = null
        try { setState({ result: evaluatePlanner(current.current), pending: false, error: null, pin: current.current.feature.properties.pin }) }
        catch (error) { setState({ result: null, pending: false, error: error.message }) }
      }
    } catch { worker.current = null }
    return () => { w?.terminate(); worker.current = null }
  }, [])
  useEffect(() => {
    const revision = ++latest.current
    setState(old => ({ ...old, pending: true, error: null }))
    const timer = setTimeout(() => {
      if (worker.current) worker.current.postMessage({ revision, input })
      else {
        try { setState({ result: evaluatePlanner(input), pending: false, error: null, pin: input.feature.properties.pin }) }
        catch (error) { setState({ result: null, pending: false, error: error.message }) }
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [input])
  return state
}

export default function Planner() {
  const [data, setData] = useState(null), [error, setError] = useState(null), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const names = ['parcels.geojson', 'neighborhoods.geojson', 'stops.geojson', 'zoning.json', 'summary.json']
    setError(null)
    Promise.all(names.map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`${name}: ${response.status}`)
      return response.json()
    })).then(([parcels, neighborhoods, stops, zoning, summary]) => setData({ parcels, neighborhoods, stops, zoning, summary }))
      .catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [attempt])
  if (!data) return <main className="planner-loading"><div className="planner-brandmark"><Icon name="building" size={30}/></div><h1>Hack the House</h1><p>{error ? `The study data could not load: ${error}` : 'Opening the Pittsburgh planning studio…'}</p>{error ? <button onClick={() => setAttempt(n => n + 1)}>Try again</button> : <span className="planner-loading-bar"/>}<small>Hazelwood + Lawrenceville · committed regional data</small></main>
  return <Studio data={data}/>
}

function Studio({ data }) {
  const { parcels, neighborhoods, stops, zoning, summary } = data
  const [context, setContext] = useState(null), [contextError, setContextError] = useState(null), [contextAttempt, setContextAttempt] = useState(0)
  const [showExisting, setShowExisting] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setContextError(null)
    Promise.all(['existing-buildings.geojson', 'existing-buildings.sources.json'].map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`Building context: ${response.status}`)
      return response.json()
    })).then(([buildings, manifest]) => setContext({ buildings, manifest })).catch(error => { if (error.name !== 'AbortError') setContextError(error.message) })
    return () => controller.abort()
  }, [contextAttempt])
  const byPin = useMemo(() => new Map(parcels.features.map(f => [f.properties.pin, f])), [parcels])
  const mapParcels = useMemo(() => slimParcels(parcels), [parcels])
  const makeScenario = useCallback(pin => {
    const feature = byPin.get(pin)
    return initialScenario(pin, feature.properties, String(preferredStop(nearbyStops(feature, stops))?.stop_id || ''))
  }, [byPin, stops])
  const [history, dispatch] = useReducer(scenarioReducer, null, () => {
    const linked = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pin') : null
    return historyFor(makeScenario(byPin.has(linked) ? linked : EXAMPLES[0].pin))
  })
  const scenario = history.present
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('pin', scenario.pin)
    window.history.replaceState(null, '', url)
  }, [scenario.pin])
  const selected = byPin.get(scenario.pin), props = selected.properties
  const [slot, setSlot] = useState('B'), [tool, setTool] = useState('housing'), [proposed, setProposed] = useState(true), [view3d, setView3d] = useState(true)
  const [query, setQuery] = useState(''), [notice, setNotice] = useState(''), [evidence, setEvidence] = useState(false)
  const nearby = useMemo(() => nearbyStops(selected, stops), [selected, stops])
  const stop = nearby.find(s => String(s.stop_id) === scenario.stopId) || null
  const input = useMemo(() => ({ feature: selected, zoning, scenario, stop }), [selected, zoning, scenario, stop])
  const evaluation = useEvaluation(input)
  const result = evaluation.pin === scenario.pin ? evaluation.result : null
  const options = result ? (proposed ? result.proposal : result.baseline) : null
  const option = scenario.options[slot], evaluated = options?.[slot]
  const winner = result ? (proposed ? result.after : result.before) : null
  const matches = useMemo(() => query.trim().length > 1 ? parcels.features.filter(f => `${f.properties.address || ''} ${f.properties.pin}`.toLowerCase().includes(query.toLowerCase().trim())).slice(0, 6) : [], [query, parcels])

  function select(pin) { if (byPin.has(pin)) { dispatch({ type: 'reset', scenario: makeScenario(pin) }); setQuery(''); setNotice('Site changed. Service and housing assumptions reset for this parcel.') } }
  function selectStop(id) {
    if (nearby.some(s => String(s.stop_id) === id)) { dispatch({ type: 'set', key: 'stopId', value: id }); setNotice('Selected stop updated. The same stop is used for baseline and proposal.') }
    else setNotice('Choose a scheduled stop within 1,200 m of this parcel.')
  }
  function changeType(typeId) { dispatch({ type: 'option', slot, value: { typeId, ...MASSING_DEFAULTS[typeId], height: BUILDINGS[typeId].heightM } }) }
  function cycle(direction) { changeType(BUILDING_IDS[(BUILDING_IDS.indexOf(option.typeId) + direction + BUILDING_IDS.length) % BUILDING_IDS.length]) }
  function set(key, value) { dispatch({ type: 'set', key, value }) }
  function setOption(key, value) { dispatch({ type: 'option', slot, value: { [key]: value } }) }
  function download() {
    const payload = { ...scenarioExport(scenario, summary), results: result, sources: { parcels: '/data/parcels.geojson', zoning: '/data/zoning.json', stops: '/data/stops.geojson' } }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `housing-scenario-${scenario.pin}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Scenario exported with model version, assumptions and comparison results.')
  }

  return <main className="studio">
    <a className="skip-link" href="#planner-inspector">Skip to planning controls</a>
    <header className="studio-header">
      <div className="studio-brand"><span className="planner-brandmark"><Icon name="building"/></span><div><strong>Hack the House<span className="studio-beta">LAB</span></strong><small>Housing + infrastructure studio</small></div></div>
      <nav className="study-switch" aria-label="Study examples">{EXAMPLES.map((example, i) => <button key={example.id} className={props.area === example.label ? 'active' : ''} onClick={() => select(example.pin)}><span>0{i + 1}</span>{example.label}</button>)}</nav>
      <div className="studio-header-actions"><a href="/explore">Parcel explorer <span aria-hidden="true">↗</span></a><button className="studio-export" onClick={download} disabled={!result || evaluation.pending}>Export scenario <span aria-hidden="true">↓</span></button></div>
    </header>
    <div className="studio-workspace">
      <section className="studio-canvas" aria-label="Planning map">
        <PlannerMap parcels={mapParcels} neighborhoods={neighborhoods} stops={stops} existingBuildings={context?.buildings} showExisting={showExisting} selected={selected} option={evaluated} slot={slot} stop={stop} proposed={proposed} additionalDepartures={scenario.additionalDepartures} view3d={view3d} onSelect={select} onStop={selectStop} tool={tool}/>
        <nav className="studio-tools" aria-label="Planning tools">{[['housing', 'building', 'Housing'], ['service', 'bus', 'Transit'], ['compare', 'chart', 'Compare']].map(([id, icon, label]) => <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon name={icon}/><span>{label}</span></button>)}<div className="tool-divider"/><button onClick={() => setView3d(!view3d)} aria-pressed={view3d}><Icon name="layers"/><span>{view3d ? '3D' : '2D'}</span></button></nav>
        <div className="canvas-heading"><span className="eyebrow">PITTSBURGH / {props.area?.toUpperCase()}</span><h1>What could we build here?</h1><p>Test a place. Compare the possibilities.</p></div>
        <div className="canvas-mode"><div className="segmented" aria-label="Infrastructure view"><button className={!proposed ? 'active' : ''} aria-pressed={!proposed} onClick={() => setProposed(false)}>Baseline</button><button className={proposed ? 'active' : ''} aria-pressed={proposed} onClick={() => setProposed(true)}>Proposal {scenario.additionalDepartures > 0 && <i/>}</button></div><div className="history-controls"><button aria-label="Undo scenario edit" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>↶</button><button aria-label="Redo scenario edit" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>↷</button></div></div>
        <div className="massing-tray"><div className="tray-top"><div><span className="eyebrow">HOUSING OPTION {slot}</span><strong>{BUILDINGS[option.typeId].label}</strong></div><span className={`option-chip slot-${slot}`}>{BUILDINGS[option.typeId].units} homes</span></div><div className="type-cycler"><button aria-label="Previous housing type" onClick={() => cycle(-1)}>←</button><div className="type-dots">{BUILDING_IDS.map(id => <button key={id} title={BUILDINGS[id].label} aria-label={`Preview ${BUILDINGS[id].label}`} aria-pressed={id === option.typeId} className={id === option.typeId ? 'active' : ''} onClick={() => changeType(id)}><Icon name="building" size={18}/></button>)}</div><button aria-label="Next housing type" onClick={() => cycle(1)}>→</button></div><p>{option.width} × {option.depth} m footprint · {option.height} m high <span>Proposed dimensions</span></p></div>
        <div className="canvas-legend"><label className="existing-toggle"><input type="checkbox" checked={showExisting} onChange={e => setShowExisting(e.target.checked)}/><i className="legend-existing"/> Existing buildings</label><span><i className="legend-parcel"/> Site</span><span><i className={`legend-building slot-${slot}`}/> Housing {slot}</span><span><i className="legend-stop"/> Stop</span><small>{contextError ? <button onClick={() => setContextAttempt(n => n + 1)}>Retry building layer</button> : context ? `${context.manifest.count.toLocaleString()} recorded outlines · heights estimated / placeholder` : 'Loading building context…'} · Dashed line: straight-line access</small></div>
      </section>

      <aside id="planner-inspector" className="studio-inspector" tabIndex={-1}>
        <div className="inspector-top"><div className="inspector-status"><span className="live-dot"/>{evaluation.pending ? 'Recalculating…' : 'Scenario ready'}<span>{MODEL_VERSION}</span></div><label className="site-search"><Icon name="pin" size={16}/><input aria-label="Search address or parcel ID" placeholder="Find an address or parcel…" value={query} onChange={e => setQuery(e.target.value)}/></label>{query.length > 1 && <div className="search-results">{matches.length ? matches.map(f => <button key={f.properties.pin} onClick={() => select(f.properties.pin)}>{f.properties.address || f.properties.pin}<small>{f.properties.neighborhood}</small></button>) : <p>No matching study parcels.</p>}</div>}</div>
        <div className="inspector-scroll">
          <div className="site-heading"><span className="eyebrow">YOUR SELECTED SITE</span><h2>{props.address || 'Unnamed parcel'}</h2><p>{props.neighborhood} · {fmt(props.lot_sqft)} sq ft</p><div className="site-tags"><span>{props.land_use || 'Land use unknown'}</span><span>{props.zoning_code || 'Zoning unknown'}</span>{props.city_owned && <span>City inventory</span>}</div></div>
          <div className="option-tabs" aria-label="Housing alternative">{['A', 'B'].map(id => <button key={id} className={slot === id ? `active slot-${id}` : ''} aria-pressed={slot === id} onClick={() => setSlot(id)}><span>{id}</span><div><strong>{BUILDINGS[scenario.options[id].typeId].label}</strong><small>{BUILDINGS[scenario.options[id].typeId].units} proposed homes</small></div></button>)}</div>
          {evaluation.error && <p role="alert" className="planner-warning">Calculation failed: {evaluation.error}</p>}
          {tool === 'housing' && <>
            <div className="section-heading"><h3>Shape the proposal</h3><span className="data-badge">Assumed</span></div><p className="section-help">These are editable massing templates, not measured buildings or an approved design.</p>
            <label className="planner-field"><span>Housing type · option {slot}</span><select value={option.typeId} onChange={e => changeType(e.target.value)}>{BUILDING_IDS.map(id => <option key={id} value={id}>{BUILDINGS[id].label}</option>)}</select></label>
            <div className="field-grid three"><Numeric label="Width (m)" value={option.width} min={2} max={100} onChange={v => setOption('width', v)}/><Numeric label="Depth (m)" value={option.depth} min={2} max={100} onChange={v => setOption('depth', v)}/><Numeric label="Height (m)" value={option.height} min={3} max={100} onChange={v => setOption('height', v)}/></div>
            {evaluated && <div className={`fit-note ${evaluated.eligible ? 'fits' : 'review'}`}><strong>{evaluated.gate}</strong><p>{evaluated.massing.reason}</p><small>{evaluated.permission.label} · §911.02. Unit count remains {evaluated.units}; dimensions do not calculate dwelling capacity.</small></div>}
            <div className="section-heading"><h3>Affordability assumptions</h3><span className="data-badge">Editable</span></div><p className="section-help">Starting income and gross rent come from the selected Census geography as context. Proposed rent and utilities are independent assumptions, not a forecast.</p>
            <Numeric label="Target household income / year ($)" value={scenario.targetIncome} min={1000} max={500000} step={1000} onChange={v => set('targetIncome', v)}/>
            <div className="field-grid"><Numeric label={`Rent / month · ${slot} ($)`} value={option.rent} max={10000} step={50} onChange={v => setOption('rent', v)}/><Numeric label="Utilities / month ($)" value={option.utilities} max={2000} step={25} onChange={v => setOption('utilities', v)}/></div>
            {evaluated && <div className="metric-highlight"><span>Housing cost / target income</span><strong>{fmt(evaluated.burden === null ? null : evaluated.burden * 100, '%')}</strong><small>30% is a screening benchmark. Financing and subsidies are not evaluated.</small></div>}
            <button className="next-tool" onClick={() => setTool('service')}>Next, test a transit investment <Icon name="arrow" size={18}/></button>
          </>}
          {tool === 'service' && <>
            <div className="section-heading"><h3>Improve scheduled service</h3><span className="data-badge observed">PRT baseline</span></div><p className="section-help">Add departures at one existing stop. This is a service-frequency scenario; it does not create a route or simulate vehicles.</p>
            <label className="planner-field"><span>Existing stop within 1,200 m</span><select value={scenario.stopId} onChange={e => selectStop(e.target.value)}>{!nearby.length && <option value="">No scheduled stop nearby</option>}{nearby.map(s => <option key={s.stop_id} value={String(s.stop_id)}>{s.name} · {Math.round(s.distance)} m</option>)}</select></label>
            {stop && <div className="service-baseline"><Icon name="bus"/><div><strong>{stop.weekday_trips} scheduled stop departures</strong><small>Baseline weekday · route labels {(stop.routes || []).join(', ') || 'unavailable'}</small></div></div>}
            <label className="service-slider"><span>Additional departures / weekday <strong>+{scenario.additionalDepartures}</strong></span><input type="range" min="0" max="120" step="5" value={scenario.additionalDepartures} disabled={!stop} onChange={e => set('additionalDepartures', Number(e.target.value))}/><small>0 <span>120 new departures</span></small></label>
            <div className="service-presets">{[0, 30, 60].map(n => <button key={n} aria-pressed={scenario.additionalDepartures === n} className={scenario.additionalDepartures === n ? 'active' : ''} onClick={() => { set('additionalDepartures', n); setProposed(true) }} disabled={!stop}>{n ? `+${n} / day` : 'No change'}</button>)}</div>
            {result?.baseline.A.service && <div className="before-after"><div><span>Baseline walk + wait</span><strong>{fmt(result.baseline.A.service.minutes, ' min')}</strong></div><Icon name="arrow"/><div><span>With added service</span><strong>{fmt(result.proposal.A.service.minutes, ' min')}</strong></div></div>}
            <p className="section-help">Straight-line walking at 80 m/min plus half the average departure interval. Assumes evenly spaced, usable departures in the service span. Route destinations, transfers, hills and actual arrival times are not modeled.</p>
            <Numeric label="Assumed service span (hours/day)" value={scenario.serviceHours} min={1} max={24} onChange={v => set('serviceHours', v)}/>
            <details className="planner-details"><summary>Capacity assumptions <span>{scenario.spareBoardings === null ? 'Unknown until supplied' : 'User-supplied scenario'}</span></summary><p>No observed spare-capacity or utility data is available. Enter a hypothetical transit reserve to test a conditional capacity scenario.</p><Numeric label="Baseline spare boardings / day" value={scenario.spareBoardings} nullable max={100000} onChange={v => set('spareBoardings', v)}/><Numeric label="Available boarding places / added departure" value={scenario.availablePlacesPerDeparture} min={0} max={100} onChange={v => set('availablePlacesPerDeparture', v)}/><Numeric label="Added daily boardings / proposed home" value={scenario.boardingsPerHome} min={0} max={20} step={.5} onChange={v => set('boardingsPerHome', v)}/><p>These assumed daily totals do not establish peak load, vehicle occupancy, funding, route feasibility or water/sewer capacity.</p></details>
            <button className="next-tool" onClick={() => setTool('compare')}>Compare the housing outcomes <Icon name="arrow" size={18}/></button>
          </>}
          {tool === 'compare' && <><div className="section-heading"><h3>Seven decision factors</h3><span className="data-badge">{proposed ? 'Proposal' : 'Baseline'}</span></div><p className="section-help">Scores are screening preferences, not probabilities. Both options use the same available factors. Select a factor to inspect its calculation.</p>{options && <div className="factor-list"><div className="factor-table-heading"><span>Suitability / 100 · higher is preferred</span><b>A</b><b>B</b></div>{PLANNER_FACTORS.map(factor => <Factor key={factor.id} factor={factor} options={options} result={result} scenario={scenario} onWeight={value => dispatch({ type: 'weight', key: factor.id, value })}/>)}</div>}<div className="coverage-note">Included: {result?.included.length || 0}/7 factors. {result?.excluded.length ? `Not weighted: ${result.excluded.map(id => PLANNER_FACTORS.find(f => f.id === id).short).join(', ')}.` : 'All factors weighted.'} Missing factors never become zero. Unknown utilities remain outside this score.</div></>}
          {result && <div className="recommendation" aria-busy={evaluation.pending}><div className="eyebrow">CONDITIONAL COMPARISON</div><h3>{winner === 'tie' ? 'The options are close' : winner ? `Option ${winner} leads this screen` : 'No ranked, permitted option'}</h3><div className="score-pair">{['A', 'B'].map(id => <div key={id}><span className={`score-slot slot-${id}`}>{id}</span><strong>{fmt(options[id].total)}</strong><small>{!options[id].eligible ? 'Needs review' : 'screening score'}</small></div>)}</div><span className="effect-label">Infrastructure effect · baseline → proposal</span><p>{result.explanation}</p><small>Passing this screen is not a feasibility determination. All options require planning and site review.</small>{tool !== 'compare' && <button onClick={() => setTool('compare')}>Inspect all seven factors <span>→</span></button>}</div>}
          <button className="evidence-toggle" onClick={() => setEvidence(!evidence)} aria-expanded={evidence}>Sources, assumptions & limits <span>{evidence ? '−' : '+'}</span></button>
          {evidence && <div className="evidence-panel"><p><strong>Observed:</strong> County parcels/assessments, ACS 2020–2024, CHAS 2018–2022, PRT stop aggregates, mapped hazards. Snapshot {summary.pulled_at}.</p><p><strong>Existing buildings:</strong> County roof outlines in their recorded positions. {context ? `${context.manifest.height_methods.stories_estimate || 0} heights estimated from assessment stories; ${context.manifest.height_methods.placeholder || 0} use a 9 m visual placeholder.` : 'Building evidence is loading or unavailable.'} Click a building to inspect its height method. No surveyed heights or terrain model; source dates and coverage vary. Nonresidential buildings are included.</p><p><strong>Proposed:</strong> dimensions, rents, utilities, target income, additional departures, service span and optional capacity. No LiDAR-derived heights have been added.</p><p><strong>Calculated:</strong> sampled outline fit, cost burden, aggregate walk/wait, conditional boarding capacity and weighted comparison.</p><p><strong>Not evaluated:</strong> setbacks, height limits, utility capacity, occupied-site acquisition, engineering, travel destinations, displacement caused by development, or marginal tonnes of CO₂.</p><p>Hazard context: {props.flood_zones?.length ? props.flood_zones.join(', ') : 'no mapped flood overlap recorded'}; steep slope {fmt(typeof props.steep_slope_overlap === 'number' ? props.steep_slope_overlap * 100 : null, '%')}; mine overlap {fmt(typeof props.undermined_overlap === 'number' ? props.undermined_overlap * 100 : null, '%')}. Missing data is not a clean site finding.</p><a href="/data/existing-buildings.sources.json" target="_blank" rel="noreferrer">Building evidence & height assumptions ↗</a><a href="/data/sources.json" target="_blank" rel="noreferrer">Source manifest ↗</a><a href="/data/score_model.json" target="_blank" rel="noreferrer">Baseline model assumptions ↗</a><a href="https://ecode360.com/45476524#45476524" target="_blank" rel="noreferrer">Zoning use table ↗</a></div>}
        </div>
        <footer className="inspector-footer"><span className="live-dot"/>Local scenario · public data · human review</footer>
      </aside>
    </div>
    <div className="planner-announcement" role="status" aria-live="polite">{notice}</div>
  </main>
}

function Factor({ factor, options, result, scenario, onWeight }) {
  const a = options.A, b = options.B
  const details = {
    demand: 'Existing neighborhood sales activity and team-chosen lot-fit curve. Not a forecast of household or typology demand. Infrastructure edits leave it unchanged.',
    physical: '100 if the fixed-size rectangular footprint passes the sampled outline search, otherwise 0. Zoning permission separately gates ranking. Setbacks, building access, height limits and engineering remain unchecked.',
    affordability: 'Monthly proposed rent + utilities divided by target monthly household income. Score falls linearly from 100 at 20% burden to 0 at 50%; these anchors are value judgments.',
    displacement: '100 minus the existing tract displacement screen. Same for both types. New service does not predict or rewrite displacement.',
    capacity: 'Available daily boardings divided by assumed new housing boardings, capped at 100. Baseline reserve + added departures × available places. Unknown reserve excludes this factor in both comparisons. Utilities not assessed.',
    access: 'Transit-access proxy: 100 × (1 − straight-line walk plus average wait / 30 minutes), clamped to 0–100. The 30-minute anchor is a choice. No job or service destinations are evaluated.',
    carbon: '100 minus the existing relative carbon proxy per home. Not incremental tonnes. Unchanged by this service edit because travel mode shifts and infrastructure emissions are not modeled.',
  }
  function metric(o) {
    if (factor.id === 'affordability') return `${fmt(o.burden === null ? null : o.burden * 100, '%')} cost burden`
    if (factor.id === 'capacity') return `${fmt(o.supply)} available / ${fmt(o.demandBoardings)} assumed boardings`
    if (factor.id === 'access') return `${fmt(o.service?.minutes, ' min')} walk + wait`
    if (factor.id === 'physical') return o.massing.fits ? 'Outline fits' : 'No sampled fit'
    if (factor.id === 'carbon') return `${fmt(o.raw.carbon_index)} relative index / home`
    if (factor.id === 'displacement') return `${fmt(o.raw.displacement_risk)} tract risk`
    return `${fmt(o.raw.demand)} market/lot proxy`
  }
  return <details className="factor-item"><summary><div><strong>{factor.label}</strong><small>{factor.kind}</small></div><span className="factor-score a">{fmt(a.scores[factor.id])}</span><span className="factor-score b">{fmt(b.scores[factor.id])}</span></summary><div className="factor-content"><div className="factor-values"><span>A · {metric(a)}</span><span>B · {metric(b)}</span></div><p>{details[factor.id]}</p><small>Source: {factor.source}</small><label className="weight-control"><span>Priority weight <strong>{scenario.weights[factor.id]}</strong></span><input type="range" min="0" max="100" step="5" value={scenario.weights[factor.id]} onChange={e => onWeight(Number(e.target.value))}/></label>{result.excluded.includes(factor.id) && <p className="planner-warning">Excluded: missing evidence or zero weight. The same coverage is used for both options and both infrastructure states.</p>}</div></details>
}
