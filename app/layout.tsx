import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Toast from "@/components/Toast"
import AppHeader from "@/components/AppHeader"
import { ThemeProvider } from "@/components/theme-provider"

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppHeader />
          {children}
          <Toast />
        </ThemeProvider>
      </body>
    </html>
  )
}
