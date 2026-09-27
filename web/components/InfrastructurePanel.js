"use client"

import { useState } from 'react'

export default function InfrastructurePanel({ network, manifest, error, retry, scenario, set, result, drawing, begin, cancel, draftNode, remove, numeric: Numeric, onAssumptions, onPoint }) {
  const [longitude,setLongitude] = useState(''), [latitude,setLatitude] = useState('')
  const before = result?.baseline[scenario.draft.typeId]?.access, after = result?.proposal[scenario.draft.typeId]?.access
  const minutes = n => Number.isFinite(n) ? `${n.toFixed(1)} min` : 'No route / unknown'
  return <>
    <div className="section-heading"><h3>Connections & parks</h3><span className="data-badge">Hypothetical</span></div>
    <p className="section-help">Follow a mapped route, add a new connection, or place a park.</p>
    {!network ? <div className="fit-note review"><strong>{error ? 'Walking network unavailable' : 'Loading walking network…'}</strong><p>Routed access remains unknown until the data loads.</p>{error && <button onClick={retry}>Retry network</button>}</div> : <>
      <div className="network-tools"><button aria-pressed={drawing === 'route'} onClick={() => begin('route')}>Route between two points</button><button aria-pressed={drawing === 'path'} onClick={() => begin('path')}>New walking connection</button><button aria-pressed={drawing === 'street'} onClick={() => begin('street')}>New street + sidewalks</button><button aria-pressed={drawing === 'park'} onClick={() => begin('park')}>Place park zone</button>{drawing && <button onClick={cancel}>Cancel drawing</button>}</div>
      <p className="section-help">{drawing === 'park' ? 'Click an open location within 50 m of a walking node. The 20 × 20 m park zone and final entrance connector are assumptions.' : drawing ? `${draftNode === null ? 'Choose the start' : 'Choose the destination'} anywhere along a blue road or path (within 35 m). ${drawing === 'route' ? 'The line follows the connected walking network automatically.' : 'A new direct link joins these points; endpoints may be 2–500 m apart.'}` : 'Two points can follow existing roads and paths. New connections reserve 3 m for paths or 12 m for streets with sidewalks; reservations reduce housing space.'}</p>
      {drawing && <details><summary>Enter map coordinates</summary><div className="network-tools"><label>Longitude<input aria-label="Route point longitude" type="number" step="any" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label><label>Latitude<input aria-label="Route point latitude" type="number" step="any" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label><button disabled={longitude === '' || latitude === '' || !Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))} onClick={()=>onPoint([Number(longitude),Number(latitude)])}>Use this point</button></div></details>}
    </>}
    <div className="infrastructure-list">{(scenario.routes || []).map(r => <div key={r.id}><strong>Mapped walking route</strong><small>{Math.round(r.meters)} m · {r.minutes.toFixed(1)} min · existing network, no score change</small><button aria-label={`Remove route ${r.id}`} onClick={() => remove('routes', r.id)}>Remove</button></div>)}{scenario.connections.map(c => <div key={c.id}><strong>{c.kind === 'path' ? 'Walking path' : 'Street + sidewalks'}</strong><small>{c.width} m reserved width · snapped endpoint junctions</small><button aria-label={`Remove ${c.kind} ${c.id}`} onClick={() => remove('connections', c.id)}>Remove</button></div>)}{scenario.parks.map(p => <div key={p.id}><strong>{p.name}</strong><small>{p.width} × {p.depth} m proposed zone · assumed entrance</small><button aria-label={`Remove park ${p.id}`} onClick={() => remove('parks', p.id)}>Remove</button></div>)}</div>
    <div className="section-heading"><h3>Calculated scenario differences</h3><span className="data-badge">Modeled</span></div>
    <div className="network-comparison"><div><span>Walk to selected stop</span><strong>{minutes(before?.walkMinutes)} → {minutes(after?.walkMinutes)}</strong></div><div><span>Nearest mapped / proposed park</span><strong>{minutes(before?.parkMinutes)} → {minutes(after?.parkMinutes)}</strong><small>{after?.parkName || 'No reachable park in extract'}</small></div></div>
    <p className="section-help">{after?.reason}</p>
    <Numeric label="Park share of access priority (%)" value={scenario.parkAccessShare} max={100} step={10} onChange={v => set('parkAccessShare', v)}/>
    <p className="compact-help">Priority: {100 - scenario.parkAccessShare}% transit / {scenario.parkAccessShare}% parks.</p>
    <button className="assumptions-link" onClick={onAssumptions}>Sources & assumptions →</button>
  </>
}
