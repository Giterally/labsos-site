import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Toast from "@/components/Toast"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Knowledge Capture",
  description: "Research project management and knowledge organization platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toast />
      </body>
    </html>
  )
}
