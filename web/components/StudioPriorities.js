import { STUDIO_PRESETS, FACTOR_LABELS } from '../lib/studioPresentation.js'
import { PLANNER_FACTORS } from '../lib/plannerState.js'
import { priorityShares, samePriorityRatios } from '../lib/priorityWeights.js'

export default function StudioPriorities({ weights, onChange, included = [], pending = false }) {
  const shares = priorityShares(weights, included)
  const anyEnabled = PLANNER_FACTORS.some(f => weights[f.id] > 0)
  function equal(value) { onChange(Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, value]))) }
  return <section className="studio-priorities" aria-busy={pending}>
    <div className="section-heading"><h3>What matters most?</h3></div>
    <p className="compact-help">Only relative weights matter. All 1s, all 50s and all 100s give the same result. Percentages show each factor’s share of the score.</p>
    <div className="priority-presets">{STUDIO_PRESETS.map(p => <button key={p.id} aria-pressed={samePriorityRatios(weights, p.weights)} onClick={() => onChange({ ...p.weights })}>{p.label}</button>)}<button onClick={() => equal(50)}>Equal priorities</button><button onClick={() => equal(0)}>All off</button></div>
    {!pending && (!anyEnabled || !included.length) && <p className="planner-warning" role="status">{!anyEnabled ? 'All priorities are off. Turn on at least one factor to rank housing.' : 'The enabled priorities have no shared evidence. Enable a factor with available data.'}</p>}
    {PLANNER_FACTORS.map(f => <label className="priority-slider" key={f.id}>
      <span>{FACTOR_LABELS[f.id]} <b>{pending ? 'Updating…' : !included.includes(f.id) && weights[f.id] > 0 ? 'Not assessed' : `${(shares[f.id] * 100).toFixed(1)}% of score`}</b></span>
      <input aria-label={`${FACTOR_LABELS[f.id]} priority`} aria-valuetext={`${weights[f.id]} relative weight; ${pending ? 'updating score share' : `${(shares[f.id] * 100).toFixed(1)} percent of score`}`} type="range" min="0" max="100" step="1" value={weights[f.id]} onChange={e => onChange({ ...weights, [f.id]: Number(e.target.value) })}/>
      <small className="priority-raw">Relative weight: {weights[f.id]}</small>
      {f.id === 'capacity' && included.includes(f.id) && <small>Scheduled departures + assumed spare places. Edit in Assumptions.</small>}
      {!pending && !included.includes(f.id) && <small>{weights[f.id] === 0 ? 'Off — excluded from the score.' : 'No shared evidence — this weight is excluded.'}</small>}
    </label>)}
    <p className="compact-help">Shares use only factors available for every selected type, before and after infrastructure changes. Rounding may make the displayed percentages slightly different from 100%.</p>
  </section>
}
