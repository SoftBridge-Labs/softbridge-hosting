export const metadata = {
  title: 'SoftBridge Hosting API',
  description: 'API for HTML Editor PRO Hosting',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
