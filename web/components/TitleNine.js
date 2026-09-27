const statusLabel = { pass: 'Pass', conflict: 'Conflict', unknown: 'Not assessed', conditional: 'Not assessed · review', not_applicable: 'Not applicable' }

function Rule({ check }) {
  return <li className={`zoning-rule ${check.status}`}><div><strong>{check.label}</strong><span>{statusLabel[check.status]}</span></div><p>{check.detail} <a href={check.url} target="_blank" rel="noreferrer">§{check.section} ↗</a></p></li>
}

export default function TitleNineChecks({ result, compact = false }) {
  if (!result) return null
  const assessed = result.checks.filter(c => ['pass', 'conflict'].includes(c.status))
  const excluded = result.checks.filter(c => ['unknown', 'conditional'].includes(c.status))
  const irrelevant = result.checks.filter(c => c.status === 'not_applicable')
  return <details className={`planner-details zoning-checks ${compact ? 'compact' : ''}`}>
    <summary>{result.conflict ? 'Zoning conflict' : `${assessed.length} zoning checks assessed`}<span>{excluded.length} not assessed</span></summary>
    <p className="compact-help">Supported conflicts remove the housing score. Checks without enough evidence are excluded. A score is not zoning approval.</p>
    <ul>{[...assessed].sort((a, b) => Number(b.status === 'conflict') - Number(a.status === 'conflict')).map(c => <Rule key={c.id} check={c}/>)}</ul>
    {!!excluded.length && <details><summary>Not assessed ({excluded.length})</summary><ul>{excluded.map(c => <Rule key={c.id} check={c}/>)}</ul></details>}
    {!!irrelevant.length && <details><summary>Not applicable ({irrelevant.length})</summary><ul>{irrelevant.map(c => <Rule key={c.id} check={c}/>)}</ul></details>}
    <small>Base standards only · mapped district {result.district || 'unknown'} · {result.version}</small>
  </details>
}

function Choice({ label, value, options, onChange }) {
  return <label className="planner-field"><span>{label}</span><select value={value ?? ''} onChange={e => onChange(e.target.value || null)}><option value="">Unknown / not assessed</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
}
function YesNo({ label, value, onChange }) {
  return <Choice label={label} value={value === true ? 'yes' : value === false ? 'no' : ''} options={[["yes", "Yes (assumed)"], ["no", "No (assumed)"]]} onChange={v => onChange(v === 'yes' ? true : v === 'no' ? false : null)}/>
}

export function ZoningInputs({ inputs, project, onChange, onProjectChange, numeric: Numeric, typeId, code }) {
  const field = (key, label, max = 1000000) => <Numeric key={key} label={label} value={inputs[key]} nullable max={max} onChange={v => onChange(key, v)}/>
  return <details className="planner-details zoning-inputs"><summary>Additional zoning evidence</summary>
    <p className="compact-help">Optional scenario inputs for this parcel. Leave unknowns blank to exclude those checks. Entered values are assumptions, not City verification.</p>
    <details><summary>Lot & existing buildings</summary><div className="field-grid">
      {field('lotSqft', 'Zoning lot area override (sq ft)')}{field('existingGfaSqft', 'Existing gross floor area (sq ft)')}{field('existingFootprintSqft', 'Existing building coverage (sq ft)')}
      {typeId === 'townhouse_duplex' && field('lotWidthFt', 'Legal lot width at front setback (ft)', 1000)}
      {code === 'H' && field('disturbancePercent', 'Total site disturbance (%)', 100)}
    </div><small>FAR and coverage include all proposed buildings on this parcel. Existing living area is not gross floor area.</small></details>
    <details><summary>Parking & bicycle spaces</summary>
      <Choice label="Applicable car-parking schedule" value={inputs.parkingRegime} options={[["base", "Base schedule · no exemptions or reductions"]]} onChange={v => onChange('parkingRegime', v)}/>
      <div className="field-grid">{field('parkingSpaces', 'Car spaces for new homes on this lot', 10000)}{field('bikeSpaces', 'Bicycle spaces on this lot', 10000)}{field('protectedBikeSpaces', 'Protected bicycle spaces', 10000)}</div>
      <small>Space counts do not establish layout or access compliance. New transit service gives no automatic parking reduction.</small>
    </details>
    <details><summary>Environment · §915.02</summary>
      <YesNo label="Grading or retaining-wall work?" value={inputs.grading} onChange={v => onChange('grading', v)}/>
      {inputs.grading === true && <div className="field-grid">{field('cutFillSlopePercent', 'Steepest cut/fill slope (%)', 1000)}{field('gradingClearanceFt', 'Minimum cut/fill clearance (ft)', 10000)}{field('retainingWallHeightFt', 'Tallest retaining wall (ft)', 1000)}</div>}
      {inputs.grading === true && <small>Clearance is from property lines, streets, buildings, parking and other developed areas.</small>}
      <YesNo label="Tree survey provided?" value={inputs.treeSurvey} onChange={v => onChange('treeSurvey', v)}/>
      <YesNo label="Removing trees ≥12 inches in diameter?" value={inputs.matureTreesRemoved} onChange={v => onChange('matureTreesRemoved', v)}/>
      {inputs.matureTreesRemoved === true && <div className="field-grid">{field('removedDiameterIn', 'Combined removed diameter (in)')}{field('replacementDiameterIn', 'Combined replacement diameter (in)')}</div>}
    </details>
    <details><summary>Landscaping · §918</summary>
      <Choice label="Landscape review applies?" value={inputs.landscapeReview} options={[["required", "Applies to this proposal"], ["not_required", "Not required (assumed)"]]} onChange={v => onChange('landscapeReview', v)}/>
      {inputs.landscapeReview === 'required' && <div className="field-grid">{field('frontageFt', 'Public-street frontage (ft)')}{field('streetTrees', 'Street trees provided')}{field('parkingLandscapeSqft', 'Parking landscape area (sq ft)')}{field('parkingTrees', 'Parking trees provided')}</div>}
    </details>
    <details><summary>Inclusionary housing · §907.04</summary>
      <Choice label="This parcel in the mapped IZ district?" value={inputs.izStatus} options={[["inside", "Inside (assumed)"], ["outside", "Outside (assumed)"]]} onChange={v => onChange('izStatus', v)}/>
      <Numeric label="On-site income-restricted homes · whole project" value={project.affordableUnits} nullable max={10000} onChange={v => onProjectChange({ ...project, affordableUnits: v })}/>
      <small>All placed buildings plus the draft are treated as one project. Covenants and official AMI are not checked; target household income does not certify affordability.</small>
    </details>
  </details>
}
