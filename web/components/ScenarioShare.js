"use client"

import { useRef, useState } from "react"

const MAX_IMPORT_BYTES = 20_000

/** Copy a versioned share link, download the scenario as JSON, or load a saved JSON file. */
export default function ScenarioShare({ shareUrl, state, onLoadState }) {
  const [status, setStatus] = useState("")
  const fileRef = useRef(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatus("Link copied. It reopens this scenario with the same weights and options.")
    } catch {
      setStatus(`Copy this link: ${shareUrl}`)
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify({ app: "Playhouse", ...state }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "hack-the-house-scenario.json"
    link.click()
    URL.revokeObjectURL(url)
    setStatus("Scenario JSON downloaded.")
  }

  async function load(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus("That file is too large to be a scenario.")
      return
    }
    try {
      onLoadState(JSON.parse(await file.text()))
      setStatus("")
    } catch {
      setStatus("That file is not valid scenario JSON.")
    }
  }

  return (
    <div className="scenario-share">
      <div className="action-row">
        <button type="button" className="secondary" onClick={copy}>
          Copy share link
        </button>
        <button type="button" className="secondary" onClick={download}>
          Download scenario JSON
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          Load scenario JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={load} aria-label="Scenario JSON file" />
      </div>
      {status ? (
        <p className="hint" role="status">
          {status}
        </p>
      ) : null}
    </div>
  )
}
