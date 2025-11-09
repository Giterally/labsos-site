"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Sparkles, X, Plus, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase-client"
import { cn } from "@/lib/utils"

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

interface AIChatSidebarProps {
  treeId: string
  projectId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
}

const MAX_CHATS = 3

export default function AIChatSidebar({ treeId, projectId, open, onOpenChange, initialQuery }: AIChatSidebarProps) {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [currentMessage, setCurrentMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialQueryHandledRef = useRef(false)

  // Storage key based on treeId (each tree = one project context)
  const storageKey = `ai-chats-${treeId}`

  // Save chats to localStorage
  const saveChats = useCallback((updatedChats: Chat[]) => {
    setChats(updatedChats)
    localStorage.setItem(storageKey, JSON.stringify(updatedChats))
  }, [storageKey])

  // Create a new chat
  const createNewChat = useCallback(() => {
    if (chats.length >= MAX_CHATS) {
      alert(`Maximum of ${MAX_CHATS} chats allowed. Please delete one to create a new chat.`)
      return
    }

    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const updated = [newChat, ...chats]
    saveChats(updated)
    setActiveChatId(newChat.id)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [chats, saveChats])

  // Delete a chat
  const deleteChat = useCallback((chatId: string) => {
    const updated = chats.filter(c => c.id !== chatId)
    // Clear localStorage if no chats remain
    if (updated.length === 0) {
      localStorage.removeItem(storageKey)
      setChats([])
      setActiveChatId(null)
    } else {
      saveChats(updated)
      if (activeChatId === chatId) {
        setActiveChatId(updated[0].id)
      }
    }
  }, [chats, activeChatId, saveChats, storageKey])

  // Update chat title from first message
  const updateChatTitle = useCallback((chatId: string, firstMessage: string) => {
    const updated = chats.map(chat => {
      if (chat.id === chatId && chat.title === 'New Chat') {
        const title = firstMessage.length > 30 
          ? firstMessage.substring(0, 30) + '...' 
          : firstMessage
        return { ...chat, title }
      }
      return chat
    })
    saveChats(updated)
  }, [chats, saveChats])

  // Get active chat
  const activeChat = chats.find(c => c.id === activeChatId)

  // Send message
  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !activeChatId || isSending) return

    setIsSending(true)
    setCurrentMessage("")

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date()
    }

    const updatedChats = chats.map(chat => {
      if (chat.id === activeChatId) {
        const updatedMessages = [...chat.messages, userMessage]
        // Update title if this is the first message
        if (chat.messages.length === 0) {
          updateChatTitle(activeChatId, messageText)
        }
        return {
          ...chat,
          messages: updatedMessages,
          updatedAt: new Date()
        }
      }
      return chat
    })
    saveChats(updatedChats)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No session found')
      }

      // Prepare conversation history
      const conversationHistory = activeChat?.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })) || []

      const response = await fetch(
        `/api/trees/${treeId}/ai-search`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: messageText,
            messages: conversationHistory,
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.answer || 'No answer available.',
          timestamp: new Date()
        }

        const finalChats = updatedChats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: [...chat.messages, assistantMessage],
              updatedAt: new Date()
            }
          }
          return chat
        })
        saveChats(finalChats)
      } else {
        const errorText = await response.text()
        let errorMessage = 'An error occurred. Please try again.'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = `Error: ${errorData.error || 'Search failed'}. ${errorData.details || ''}`
        } catch {
          // Use default
        }

        const errorMessageObj: ChatMessage = {
          role: 'assistant',
          content: errorMessage,
          timestamp: new Date()
        }

        const finalChats = updatedChats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: [...chat.messages, errorMessageObj],
              updatedAt: new Date()
            }
          }
          return chat
        })
        saveChats(finalChats)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessageObj: ChatMessage = {
        role: 'assistant',
        content: 'An error occurred. Please try again.',
        timestamp: new Date()
      }
      const finalChats = updatedChats.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: [...chat.messages, errorMessageObj],
            updatedAt: new Date()
          }
        }
        return chat
      })
      saveChats(finalChats)
    } finally {
      setIsSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeChatId, chats, treeId, activeChat, saveChats, updateChatTitle, isSending])

  // Load chats from localStorage
  useEffect(() => {
    if (open && !initialQueryHandledRef.current) {
      initialQueryHandledRef.current = true
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          const loadedChats: Chat[] = parsed.map((chat: any) => ({
            ...chat,
            messages: chat.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            })),
            createdAt: new Date(chat.createdAt),
            updatedAt: new Date(chat.updatedAt)
          }))
          setChats(loadedChats)
          
          // If there's an initial query, create a new chat and send it
          if (initialQuery && initialQuery.trim()) {
            const newChat: Chat = {
              id: `chat-${Date.now()}`,
              title: initialQuery.length > 30 ? initialQuery.substring(0, 30) + '...' : initialQuery,
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date()
            }
            const updated = [newChat, ...loadedChats]
            saveChats(updated)
            setActiveChatId(newChat.id)
            // Send the initial query after a short delay to ensure chat is set up
            setTimeout(() => {
              sendMessage(initialQuery)
            }, 100)
          } else {
            // Set active chat to most recent if chats exist
            if (loadedChats.length > 0) {
              const mostRecent = loadedChats.sort((a, b) => 
                b.updatedAt.getTime() - a.updatedAt.getTime()
              )[0]
              setActiveChatId(mostRecent.id)
            } else {
              // No chats - create a new one when sidebar opens
              createNewChat()
            }
          }
        } catch (e) {
          console.error('Failed to parse saved chats:', e)
          // Clear invalid data
          localStorage.removeItem(storageKey)
          if (initialQuery && initialQuery.trim()) {
            const newChat: Chat = {
              id: `chat-${Date.now()}`,
              title: initialQuery.length > 30 ? initialQuery.substring(0, 30) + '...' : initialQuery,
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date()
            }
            setChats([newChat])
            setActiveChatId(newChat.id)
            setTimeout(() => {
              sendMessage(initialQuery)
            }, 100)
          } else {
            createNewChat()
          }
        }
      } else {
        // No existing chats - create a new one when sidebar opens
        if (initialQuery && initialQuery.trim()) {
          const newChat: Chat = {
            id: `chat-${Date.now()}`,
            title: initialQuery.length > 30 ? initialQuery.substring(0, 30) + '...' : initialQuery,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
          setChats([newChat])
          setActiveChatId(newChat.id)
          setTimeout(() => {
            sendMessage(initialQuery)
          }, 100)
        } else {
          createNewChat()
        }
      }
    }
  }, [open, storageKey, initialQuery, saveChats, createNewChat, sendMessage])

  // Reset initial query handler when sidebar closes
  useEffect(() => {
    if (!open) {
      initialQueryHandledRef.current = false
    }
  }, [open])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeChat?.messages, isSending])

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (currentMessage.trim() && !isSending) {
        sendMessage(currentMessage)
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right"
        className={cn(
          "flex flex-col p-0 gap-0 w-full sm:max-w-lg",
          "[&>button]:hidden"
        )}
      >
        {/* Visually hidden title for accessibility */}
        <SheetTitle className="sr-only">AI Chat</SheetTitle>
        
        {/* Chat Tabs Bar */}
        <div className="border-b flex-shrink-0 bg-gray-50">
          {chats.length === 0 ? (
            <div className="px-4 py-3 flex items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={createNewChat}
                className="h-9 px-4 flex items-center gap-2 bg-white border-purple-200 hover:bg-purple-50 hover:border-purple-300 text-purple-700"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">New Chat</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 overflow-x-auto">
              {chats.slice(0, MAX_CHATS).map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "flex items-center gap-1 flex-shrink-0 rounded-lg px-3 py-2 transition-all",
                    activeChatId === chat.id
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  )}
                >
                  <button
                    onClick={() => setActiveChatId(chat.id)}
                    className="flex-1 min-w-0 max-w-[180px] text-left"
                  >
                    <span className="text-sm font-medium truncate block">{chat.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-5 w-5 p-0 opacity-70 hover:opacity-100 flex-shrink-0",
                      activeChatId === chat.id ? "text-white hover:bg-purple-700" : "text-gray-500 hover:text-red-500"
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteChat(chat.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {/* New Chat Button - Only show if less than MAX_CHATS */}
              {chats.length < MAX_CHATS && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createNewChat}
                  className="h-9 px-3 flex items-center gap-1.5 flex-shrink-0 bg-white border-gray-200 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">New Chat</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeChat ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeChat.messages.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Start a conversation</p>
                    <p className="text-sm text-gray-500 mt-1">Ask questions about this experiment tree</p>
                  </div>
                ) : (
                  activeChat.messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex",
                        message.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-4 py-2",
                          message.role === 'user'
                            ? "bg-blue-600 text-white"
                            : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                        )}
                      >
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={12} />
                            <span className="text-xs font-semibold uppercase tracking-wide opacity-90">AI</span>
                          </div>
                        )}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))
                )}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-purple-600 border-t-transparent"></div>
                        <span className="text-sm text-gray-600">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t p-4 flex-shrink-0">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question..."
                    disabled={isSending}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => sendMessage(currentMessage)}
                    disabled={!currentMessage.trim() || isSending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Sparkles className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-700 font-medium text-lg mb-2">Start a chat to learn about the experiment tree</p>
              <p className="text-sm text-gray-500">Ask questions about nodes, blocks, and relationships</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

