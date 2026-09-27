"use client"

import { useMemo } from "react"

import { buildEvidence } from "../lib/evidence.js"

/** Per-factor evidence for one parcel and one scored type. Links come from the committed source manifest. */
export default function EvidenceDrawer({ props, typeId, typeLabel, sources, summary, zoning, model }) {
  const evidence = useMemo(
    () => (props ? buildEvidence({ props, typeId, sources, summary, zoningRules: zoning, model }) : []),
    [props, typeId, sources, summary, zoning, model],
  )
  if (!props) return null
  return (
    <section className="evidence" aria-label="Evidence behind each factor">
      <h3>Evidence behind each factor</h3>
      <p className="hint">
        For {typeLabel} at {props.address || props.pin}. Each entry lists the source and vintage, the geography, what was
        observed, how it becomes a score (assumptions), what is missing, and the source&apos;s own limit.
      </p>
      {evidence.map((entry) => (
        <details key={entry.id} className="evidence-item">
          <summary>
            <strong>{entry.label}</strong>: {entry.value === null ? "missing" : entry.value.toFixed(1)}
            {entry.direction === "higher_worse" ? " (higher is worse)" : ""}
            {entry.missing.length ? <span className="hint"> · {entry.missing.length} missing</span> : null}
          </summary>
          <dl>
            <dt>Geography</dt>
            <dd>{entry.geography}</dd>
            <dt>Sources</dt>
            <dd>
              <ul>
                {entry.sources.map((source) => (
                  <li key={source.name}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.name}
                      </a>
                    ) : (
                      source.name
                    )}{" "}
                    · {source.vintage}
                  </li>
                ))}
              </ul>
            </dd>
            <dt>Observed</dt>
            <dd>
              {entry.observed.length ? (
                <ul>
                  {entry.observed.map(([label, value]) => (
                    <li key={label}>
                      {label}: <strong>{value}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                "No observed inputs recorded."
              )}
            </dd>
            <dt>How it becomes a score (assumptions)</dt>
            <dd>
              <ul>
                {entry.assumptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
            <dt>Missing</dt>
            <dd>{entry.missing.length ? entry.missing.join(" · ") : "Nothing missing for this factor."}</dd>
            <dt>Limits</dt>
            <dd>
              <ul>
                {entry.sources
                  .filter((source) => source.limit)
                  .map((source) => (
                    <li key={source.name}>
                      {source.name}: {source.limit}
                    </li>
                  ))}
              </ul>
            </dd>
          </dl>
        </details>
      ))}
    </section>
  )
}
