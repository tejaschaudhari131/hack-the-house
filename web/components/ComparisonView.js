"use client"

import { NOT_EVALUATED } from "../lib/explainFacts.js"
import { ROUNDING_NOTE, describeComparison } from "../lib/comparison.js"
import { round1 } from "../lib/factors.js"

function fmt(value) {
  if (value === null || value === undefined) return "—"
  return round1(value).toFixed(1)
}

function signed(value) {
  if (value === null || value === undefined) return "—"
  const size = round1(Math.abs(value))
  if (size === 0) return "0.0"
  return value > 0 ? `+${size.toFixed(1)} A` : `+${size.toFixed(1)} B`
}

function ScenarioHead({ side }) {
  return (
    <div className="scenario-head">
      <p className="scenario-slot">Scenario {side.slot}</p>
      <p>
        <strong>{side.label}</strong>
        {side.units ? ` · ${side.units} ${side.units === 1 ? "home" : "homes"} (display default)` : ""}
      </p>
      <p className="hint">
        {side.address || side.pin} · {side.neighborhood} · zoning {side.zoningCode || "not matched"}
      </p>
      <p>
        <span className={`badge ${side.permission.badgeId}`}>{side.permission.label}</span>
      </p>
      <p className="scenario-score">
        Suitability score <strong>{side.composite ?? "none"}</strong>
        <span className="hint"> / 100 under the current weights</span>
      </p>
      {side.noScoreReason ? <p className="warning">{side.noScoreReason}</p> : null}
      <p className="hint">{side.coverage}</p>
      {side.scoreNote ? <p className="hint">{side.scoreNote}</p> : null}
    </div>
  )
}

/** The comparison object from lib/comparison.js, rendered with numeric labels (not color alone). */
export default function ComparisonView({ result, onPrint }) {
  if (!result) return null
  const rows = result.factors.filter((row) => row.weight > 0 || row.a.value !== null || row.b.value !== null)
  return (
    <div className="comparison">
      <div className="scenario-pair">
        <ScenarioHead side={result.a} />
        <ScenarioHead side={result.b} />
      </div>
      <p className="comparison-summary">{describeComparison(result)}</p>
      <div className="table-wrap">
        <table className="contrib-table">
          <caption>
            Points each factor adds to each score. Contribution = weight × suitability ÷ the sum of weights of that
            scenario&apos;s available factors. Risk factors count as 100 minus the value. {ROUNDING_NOTE}
          </caption>
          <thead>
            <tr>
              <th scope="col">Factor</th>
              <th scope="col">Weight</th>
              <th scope="col">A value</th>
              <th scope="col">B value</th>
              <th scope="col">A points</th>
              <th scope="col">B points</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.weight > 0 ? "" : "muted"}>
                <th scope="row">
                  {row.label}
                  {row.direction === "higher_worse" ? <span className="hint"> (lower is better)</span> : null}
                  {row.heldConstant ? <span className="hint"> · held constant</span> : null}
                </th>
                <td>{row.weight}</td>
                <td>{fmt(row.a.value)}</td>
                <td>{fmt(row.b.value)}</td>
                <td>{fmt(row.a.contribution)}</td>
                <td>{fmt(row.b.contribution)}</td>
                <td>{row.weight > 0 ? signed(row.difference) : "weight 0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td />
              <td />
              <td>{fmt(result.a.exact)}</td>
              <td>{fmt(result.b.exact)}</td>
              <td>{result.ranked ? signed(result.gap) : "not ranked"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">
        <strong>Not evaluated:</strong> {NOT_EVALUATED.join(" ")} Permission is shown separately and is not part of the
        score.
      </p>
      {onPrint ? (
        <button type="button" className="secondary" onClick={onPrint}>
          Print decision brief
        </button>
      ) : null}
    </div>
  )
}
