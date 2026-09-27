import { USE_LEGEND, PLACEMENT_COLORS } from '../lib/buildingUses.js'

const SHORT_LABELS = {
  single_family: 'Single', townhouse_duplex: 'Town / duplex', small_apartment: 'Apts 3–19',
  large_apartment: 'Apts 20+', other_residential: 'Other homes', nonresidential: 'Non-res.', unknown: 'Unknown',
}

export default function MapLegend({ showExisting, onShowExisting, context, error, onRetry }) {
  return <details className="canvas-legend">
    <summary aria-label="Map legend">
      <span className="legend-heading">Legend <span className="legend-expand">Expand <span aria-hidden="true">⌄</span></span><span className="legend-collapse">Collapse <span aria-hidden="true">⌃</span></span></span>
      <span className="legend-chips">{USE_LEGEND.map(use => <span key={use.id} title={use.label}><i style={{ background: use.color }} aria-hidden="true"/>{SHORT_LABELS[use.id]}</span>)}</span>
    </summary>
    <div className="legend-details">
      <label className="existing-toggle"><input type="checkbox" checked={showExisting} onChange={e => onShowExisting(e.target.checked)}/>Show existing buildings</label>
      <div className="legend-full-labels">{USE_LEGEND.map(use => <span key={use.id}><i style={{ background: use.color }} aria-hidden="true"/>{use.label}</span>)}</div>
      <div className="legend-markers"><span><i className="legend-parcel" aria-hidden="true"/>Selected site</span><span><i style={{ background: PLACEMENT_COLORS.valid }} aria-hidden="true"/>No supported conflict</span><span><i style={{ background: PLACEMENT_COLORS.invalid }} aria-hidden="true"/>Placement review</span><span><i className="legend-stop" aria-hidden="true"/>Bus stop</span></div>
      <p>Lighter shades = simulated buildings. Blue line = modeled walk to stop.</p>
      <small>{error ? <button onClick={onRetry}>Retry building layer</button> : context ? `${context.manifest.count.toLocaleString()} recorded outlines` : 'Loading building context…'}</small>
    </div>
  </details>
}
