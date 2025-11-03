import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Toast from "@/components/Toast"
import AppHeader from "@/components/AppHeader"
import FeedbackButton from "@/components/FeedbackButton"
import { ThemeProvider } from "@/components/theme-provider"
import { UserProvider } from "@/lib/user-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Olvaro",
  description: "Research project management and knowledge organization platform",
  icons: {
    icon: '/olvaro-fin copy.png',
    apple: '/olvaro-fin copy.png',
  },
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
          <UserProvider>
            <AppHeader />
            {children}
            <FeedbackButton />
            <Toast />
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
