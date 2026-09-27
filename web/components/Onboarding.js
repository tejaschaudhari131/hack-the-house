"use client"

import { useEffect, useRef, useState } from "react"

const STORAGE_KEY = "htm:onboarded:v1"

const STEPS = [
  {
    title: "Compare housing options for real Pittsburgh lots",
    body: (
      <>
        <p>
          Hack the House helps CDC staff and city planners decide which lot and which kind of housing to look at next,
          in <strong>Hazelwood</strong> and <strong>Lawrenceville</strong>.
        </p>
        <p className="hint">It is a screening aid, not a permit. Real decisions go to City Planning or a professional.</p>
      </>
    ),
  },
  {
    title: "Three steps",
    body: (
      <ol className="intro-steps">
        <li>
          <strong>Find sites:</strong> start from a question, like City-owned vacant lots where a triplex is allowed.
        </li>
        <li>
          <strong>Compare options:</strong> put two kinds of housing on one lot and see which scores higher, whether each
          is allowed, and why.
        </li>
        <li>
          <strong>Get the brief:</strong> a one-page summary with next steps to print or save.
        </li>
      </ol>
    ),
  },
  {
    title: "Your priorities are a choice",
    body: (
      <>
        <p>
          Under <strong>What matters most to you?</strong> pick a starting point, like housing need or transit. The
          scores stay the same; only how much each one counts changes, and the app tells you if the ranking changes.
        </p>
        <p className="hint">Details on every number are one click away under &quot;How was this scored?&quot;</p>
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
    else setTimeout(() => document.querySelector(".skip-link")?.focus(), 0)
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
          Start guided example
        </button>
      </div>
    </dialog>
  )
}
