const FLAG_KEY = "housing-matchmaker-flags"

export function loadFlags() {
  if (typeof window === "undefined") return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FLAG_KEY) || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function saveFlag(pin, { address, note }) {
  const flags = loadFlags()
  flags[pin] = {
    pin,
    address: address || null,
    note: (note || "").trim(),
    flaggedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(FLAG_KEY, JSON.stringify(flags))
  return flags
}

export function clearFlag(pin) {
  const flags = loadFlags()
  delete flags[pin]
  window.localStorage.setItem(FLAG_KEY, JSON.stringify(flags))
  return flags
}
