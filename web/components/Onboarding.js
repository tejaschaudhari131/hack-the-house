"use client"

import { useEffect, useRef, useState } from "react"

const STORAGE_KEY = "htm:onboarded:v1"

const STEPS = [
  {
    title: "What this is, and who it helps",
    body: (
      <>
        <p>
          A screening aid that compares four housing types (single-family, townhouse / duplex, small apartment, large
          apartment) on real Pittsburgh parcels in <strong>Hazelwood</strong> and <strong>Lawrenceville</strong>.
        </p>
        <p>
          It scores market demand, transit access, equity, and mapped climate hazard from public data, and it reads the
          zoning use table (§911.02). It is for planners, community development corporations, developers, and residents
          who want to see the trade-offs before a meeting.
        </p>
        <p className="hint">
          It does not decide what may be built. Take real decisions to City Planning or a qualified professional.
        </p>
      </>
    ),
  },
  {
    title: "Click a parcel, or drop a building",
    body: (
      <>
        <p>
          <strong>Click a parcel</strong> to see all four types ranked for that lot, the §911.02 reading for each, and the
          sources behind every score.
        </p>
        <p>
          <strong>Drop a building</strong> to place one type on a lot in 3D with a 10-minute walk ring and nearby transit.
          Drop a second one to compare two scenarios side by side.
        </p>
      </>
    ),
  },
  {
    title: "Compare, then change what matters",
    body: (
      <>
        <p>
          The weights are value judgments. Pick a viewpoint (Resident, CDC, Planner, Developer, Climate-first) or move the
          sliders yourself.
        </p>
        <p>
          <strong>How stable is #1?</strong> tells you whether the top result holds across those viewpoints, or flips
          when one weight changes. A flip means the answer is about values, not data.
        </p>
        <p>
          Then ask for a plain-language explanation, or print a one-page report for a community meeting.
        </p>
      </>
    ),
  },
]

export function hasOnboarded() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return true
  }
}

export default function Onboarding({ open, onClose, onExample }) {
  const dialogRef = useRef(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setStep(0)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function finish(next) {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {}
    onClose()
    if (next === "example") onExample()
  }

  const current = STEPS[step]
  const last = step === STEPS.length - 1
  return (
    <dialog
      ref={dialogRef}
      className="onboarding"
      aria-labelledby="onboarding-title"
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
    >
      <p className="onboarding-step" aria-live="polite">
        Step {step + 1} of {STEPS.length}
      </p>
      <h2 id="onboarding-title">{current.title}</h2>
      <div className="onboarding-body">{current.body}</div>
      <div className="onboarding-actions">
        <button type="button" className="text-button" onClick={() => finish()}>
          Skip
        </button>
        <span className="spacer" />
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {last ? (
          <button type="button" onClick={() => finish()}>
            Explore on my own
          </button>
        ) : (
          <button type="button" onClick={() => setStep(step + 1)} autoFocus>
            Next
          </button>
        )}
        <button type="button" className="explain" onClick={() => finish("example")}>
          Try an example
        </button>
      </div>
    </dialog>
  )
}
