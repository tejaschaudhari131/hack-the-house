import "./globals.css"

export const metadata = {
  title: "Hack the House · Pittsburgh housing-site decision support",
  description:
    "Screening aid for planners, CDCs, developers, and residents: compare four housing types on real Hazelwood and Lawrenceville parcels by demand, transit, equity, and climate risk, with §911.02 zoning readings and sources.",
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
