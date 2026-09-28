import { useEffect, useRef, useState } from 'react'
import { USE_LEGEND, PLACEMENT_COLORS, placedBuildingColor } from '../lib/buildingUses.js'

const SHORT_LABELS = {
  single_family: 'Single-family', townhouse_duplex: 'Town / duplex', small_apartment: 'Apartments 3–19',
  large_apartment: 'Apartments 20+', other_residential: 'Other homes', nonresidential: 'Non-residential', unknown: 'Unknown use',
}

export default function MapLegend({ showExisting, onShowExisting, error, onRetry }) {
  const container = useRef(null), [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const outside = event => { if (!container.current.contains(event.target)) container.current.open = false }
    const escape = event => {
      if (event.key !== 'Escape') return
      container.current.open = false
      container.current.querySelector('summary').focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <details ref={container} className="canvas-legend" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label="Map key">
      <span className="legend-icon" aria-hidden="true">{USE_LEGEND.slice(0, 3).map(use => <i key={use.id} style={{ background: use.color }}/>)}</span>
      Map key <span className="legend-chevron" aria-hidden="true">⌃</span>
    </summary>
    <div className="legend-details">
      <label className="existing-toggle"><input type="checkbox" checked={showExisting} onChange={e => onShowExisting(e.target.checked)}/>Existing buildings</label>
      <table className="legend-colours" aria-label="Existing and planned building colours">
        <thead><tr><th scope="col">Housing / use</th><th scope="col">Existing</th><th scope="col">Planned</th></tr></thead>
        <tbody>{USE_LEGEND.map(use => <tr key={use.id}><th scope="row" title={use.label}>{SHORT_LABELS[use.id]}</th><td><i style={{ background: use.color }} aria-hidden="true"/></td><td>{use.simulated ? <i className="legend-planned" style={{ background: placedBuildingColor(use.id) }} aria-hidden="true"/> : '—'}</td></tr>)}</tbody>
      </table>
      <div className="legend-markers"><span><i className="legend-parcel" aria-hidden="true"/>Selected site</span><span><i className="legend-stop" aria-hidden="true"/>Bus stop</span><span><i style={{ background: PLACEMENT_COLORS.valid }} aria-hidden="true"/>Preview: clear</span><span><i style={{ background: PLACEMENT_COLORS.invalid }} aria-hidden="true"/>Preview: review</span></div>
      <p>Blue line: walk to stop</p>
      {error && <button onClick={onRetry}>Retry building layer</button>}
    </div>
  </details>
}
