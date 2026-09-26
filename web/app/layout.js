import "./globals.css"

export const metadata = {
  title: "Housing typology matchmaker",
  description:
    "Decision support for comparing housing types in Hazelwood and Lawrenceville across demand, transit, equity, and climate risk.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
