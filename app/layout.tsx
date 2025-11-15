import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Toast from "@/components/Toast"
import AppHeader from "@/components/AppHeader"
import FeedbackButton from "@/components/FeedbackButton"
import { ThemeProvider } from "@/components/theme-provider"
import { UserProvider } from "@/lib/user-context"
import { ChatSidebarProvider } from "@/lib/chat-sidebar-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Olvaro",
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
          <UserProvider>
            <ChatSidebarProvider>
              <AppHeader />
              {children}
              <FeedbackButton />
              <Toast />
            </ChatSidebarProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
