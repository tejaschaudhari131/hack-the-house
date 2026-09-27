import "./globals.css"
import "./planner.css"

export const metadata = {
  title: "Playhouse · Pittsburgh Planning Studio",
  description:
    "Explore Pittsburgh housing and infrastructure scenarios in 3D. Compare housing options, adjust priorities, and inspect the public data and assumptions behind each result.",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
