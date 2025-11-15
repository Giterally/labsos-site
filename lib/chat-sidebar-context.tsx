"use client"

import { createContext, useContext, useState, ReactNode } from 'react'

interface ChatSidebarContextType {
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
}

const ChatSidebarContext = createContext<ChatSidebarContextType | undefined>(undefined)

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false)

  return (
    <ChatSidebarContext.Provider value={{ isChatOpen, setIsChatOpen }}>
      {children}
    </ChatSidebarContext.Provider>
  )
}

export function useChatSidebar() {
  const context = useContext(ChatSidebarContext)
  if (context === undefined) {
    // Return default values if context is not available (shouldn't happen but be defensive)
    return { isChatOpen: false, setIsChatOpen: () => {} }
  }
  return context
}

