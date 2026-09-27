"use client"

import { useEffect, useMemo, useState } from "react"

import { AI_LABEL } from "./Explanation.js"
import { ROUNDING_NOTE, describeComparison } from "../lib/comparison.js"
import { NOT_EVALUATED, sourceList } from "../lib/explainFacts.js"
import { PROMPT_VERSION } from "../lib/explainPrompt.js"
import { describeFilters } from "../lib/explainSites.js"
import { FACTORS, round1, weightShares } from "../lib/factors.js"
import { nextActions } from "../lib/nextActions.js"
import { matchPreset } from "../lib/presets.js"
import { describeRobustness } from "../lib/robustness.js"
import { SITE_CAVEAT } from "../lib/sites.js"

function fmt(value) {
  if (value === null || value === undefined) return "—"
  const text = round1(value).toFixed(1)
  return text === "-0.0" ? "0.0" : text
}

/** Print-only decision brief for a two-scenario comparison. Hidden on screen; see @media print. */
export default function DecisionBrief({ compare, weights, featureA, featureB, zoning, summary, model, shortlist, shareUrl }) {
  const [sources, setSources] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch("/data/sources.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setSources(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const cited = useMemo(() => sourceList(sources, summary, zoning), [sources, summary, zoning])
  if (!compare?.result || !featureA || !featureB) return null
  const { result, robustness, explanation } = compare
  const shares = weightShares(weights)
  const preset = matchPreset(weights)
  const actions = nextActions(result, featureA.properties, featureB.properties)
  const ai = explanation?.source === "ai" && !explanation.streaming
  const factorSources = [cited.assessment, cited.transit, cited.acs, cited.chas, cited.flood, cited.slope, cited.undermined, cited.tenure, cited.rent2019, cited.recs, cited.embodied, cited.cityOwned, cited.taxDelinquent]
  const generated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })

  return (
    <article className="print-brief">
      <p className="report-kicker">Playhouse · Housing decision brief · Hazelwood and Lawrenceville, Pittsburgh</p>
      <h1>
        {result.sameParcel
          ? `Two housing options for ${result.a.address || result.a.pin}`
          : `${result.a.label} at ${result.a.address || result.a.pin} vs ${result.b.label} at ${result.b.address || result.b.pin}`}
      </h1>
      <p className="report-callout">
        <strong>Screening aid only.</strong> A weighted score is not a permit, survey, feasibility study, affordability
        guarantee, or prediction of displacement. Confirm with City Planning / the Zoning Administrator or a qualified
        professional before acting.
      </p>
      {shortlist ? (
        <p className="report-small">
          Shortlist: {shortlist.count} parcels matched Find Sites filters ({describeFilters(shortlist.filters).join("; ") || "none"}). {SITE_CAVEAT}
        </p>
      ) : null}

      <section>
        <h2>Scenarios</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Building</th>
              <th>Parcel</th>
              <th>§911.02 permission (separate from the score)</th>
              <th>Score</th>
              <th>Evidence coverage</th>
            </tr>
          </thead>
          <tbody>
            {[result.a, result.b].map((side) => (
              <tr key={side.slot}>
                <td>{side.slot}</td>
                <td>
                  {side.label}
                  {side.units ? `, ${side.units} homes (display default)` : ""}
                </td>
                <td>
                  {side.address || "no address"} · PIN {side.pin} · {side.neighborhood} · {side.zoningCode || "no zoning match"}
                </td>
                <td>
                  {side.permission.label}. {side.permission.detail}
                </td>
                <td>{side.composite ?? "none"}</td>
                <td>{side.coverage}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{describeComparison(result)}</p>
      </section>

      <section>
        <h2>Why they differ: points each factor adds</h2>
        <table className="report-ranking">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Weight (share)</th>
              <th>A value</th>
              <th>B value</th>
              <th>A pts</th>
              <th>B pts</th>
              <th>A − B</th>
            </tr>
          </thead>
          <tbody>
            {result.factors.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.label}
                  {row.direction === "higher_worse" ? " (lower is better)" : ""}
                </td>
                <td>
                  {row.weight} ({Math.round(shares[row.id] * 100)}%)
                </td>
                <td>{fmt(row.a.value)}</td>
                <td>{fmt(row.b.value)}</td>
                <td>{fmt(row.a.contribution)}</td>
                <td>{fmt(row.b.contribution)}</td>
                <td>{row.weight > 0 ? fmt(row.difference) : "weight 0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-small">
          Weights are relative (shares shown are normalized). Contribution = weight × suitability ÷ the sum of weights of
          that scenario&apos;s available factors; risk factors count as 100 minus the value. {ROUNDING_NOTE} Transit also enters the carbon
          proxy, and need indicators enter both equity and displacement, so the factors are not independent.
          {preset ? ` Preset: ${preset.label} (a team-authored example, not a measured stakeholder preference).` : " Custom weights."}
        </p>
      </section>

      <section className="report-two">
        <div>
          <h2>Do other priorities change the result?</h2>
          <p>{robustness ? describeRobustness(robustness) : "Not calculated."}</p>
          {robustness ? (
            <p className="report-small">{robustness.presets.map((row) => `${row.label}: ${row.winner?.label || "not ranked"}`).join(" · ")}</p>
          ) : null}
          {compare.sweep ? (
            <p className="report-small">
              One-factor sweep (0–100, step 1, others fixed):{" "}
              {compare.sweep
                .filter((row) => row.solved.length || row.same)
                .map((row) => (row.same ? `${row.label}: cannot reorder (same value)` : `${row.label}: equal at ${row.solved[0].toFixed(2)} (solved)`))
                .join("; ")}
              .
            </p>
          ) : null}
        </div>
        <div>
          <h2>Unresolved before acting</h2>
          <ul className="report-small">
            {NOT_EVALUATED.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Every §911.02 reading needs expert review; overlays are not applied.</li>
            <li>Hazard overlaps are map screens; displacement is a tract-level screening signal; carbon is a relative proxy, not tonnes.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>Next steps</h2>
        <ol>
          {actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </section>

      <section className="report-summary">
        <h2>{ai ? AI_LABEL : "Summary"}</h2>
        {ai ? (
          explanation.text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => <p key={index}>{line}</p>)
        ) : (
          <p className="report-small">No AI summary was generated for this brief. The comparison above is the deterministic explanation.</p>
        )}
      </section>

      <footer className="report-small">
        <strong>Sources.</strong>{" "}
        {factorSources
          .filter((source) => source?.name)
          .map((source) => `${source.name} (${String(source.vintage || "").split(";")[0]})`)
          .join("; ")}
        . Zoning: {cited.zoningCode.name}, {cited.zoningCode.url}. Factor definitions: {FACTORS.map((factor) => factor.label).join(", ")}.
        <br />
        Build {process.env.NEXT_PUBLIC_COMMIT_SHA || "unknown"} · score model v{model?.version ?? "?"} · data pulled{" "}
        {summary?.pulled_at || "?"} · prompt {PROMPT_VERSION} · generated {generated}. No owner names or debt amounts are
        in this data.
        {shareUrl ? <><br />Reproduce this scenario: {shareUrl}</> : null}
      </footer>
    </article>
  )
}
