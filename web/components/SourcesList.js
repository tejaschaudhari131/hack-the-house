"use client"

import { useState } from "react"

/** The organizers'-list citation for each source the pipeline read, from sources.json. */
export default function SourcesList({ sources, filter }) {
  const [open, setOpen] = useState(false)
  const rows = (sources || []).filter((row) => (filter ? filter(row) : true))
  if (!rows.length) return null
  return (
    <div className="sources">
      <button type="button" className="text-button" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide data sources" : `Show data sources (${rows.length})`}
      </button>
      {open ? (
        <ul>
          {rows.map((row) => (
            <li key={row.name}>
              <a href={row.catalog_url || row.url} target="_blank" rel="noreferrer">
                {row.catalog_name || row.name}
              </a>
              {row.catalog_name && row.catalog_name !== row.name ? ` (${row.name})` : ""}
              {" · "}
              {row.publisher}
              {row.pulled_at ? ` · pulled ${row.pulled_at}` : ""}
              {row.status && row.status !== "ok" ? ` · ${row.status.replace(/_/g, " ")}` : ""}
              {row.caveat ? <p className="hint">Caveat: {row.caveat}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
