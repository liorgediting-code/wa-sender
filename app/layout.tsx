import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WA Sender',
  description: 'Bulk WhatsApp message sender',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="ltr">
      <body>{children}</body>
    </html>
  )
}
