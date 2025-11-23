"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Sparkles, X, Plus, Trash2, Pencil, Check, ExternalLink, FileText, Video, Link as LinkIcon, Copy, CheckCircle2, RotateCcw, Square } from "lucide-react"
import { supabase } from "@/lib/supabase-client"
import { useUser } from "@/lib/user-context"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import VideoEmbed from "@/components/VideoEmbed"
import { detectVideoType } from "@/lib/video-utils"
import type { TreeContext } from "@/lib/tree-context"
import { useChatSidebar } from "@/lib/chat-sidebar-context"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
// Agentic features removed - see REMOVED_FEATURES.md

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  tree_context?: TreeContext
  metadata?: {
    used_semantic_search?: boolean
    context_strategy?: string
    total_nodes?: number
    context_nodes?: number
    query_classification?: string
    estimated_cost?: number
    timestamp?: string
  }
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
  onTreeUpdated?: (updatedTreeContext: TreeContext) => void
  hasEditPermission?: boolean // If false, agent button will be hidden
}

const MAX_CHATS = 3

// Helper function to normalize YouTube URLs to video ID for comparison
function normalizeVideoUrl(url: string): string {
  const videoInfo = detectVideoType(url)
  if (videoInfo.type === 'youtube') {
    // Extract video ID from YouTube URL
    const youtubePatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/.*[?&]v=([^&\n?#]+)/
    ]
    for (const pattern of youtubePatterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return `youtube:${match[1]}`
      }
    }
  } else if (videoInfo.type === 'vimeo') {
    const vimeoRegex = /vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/
    const vimeoMatch = url.match(vimeoRegex)
    if (vimeoMatch && vimeoMatch[1]) {
      return `vimeo:${vimeoMatch[1]}`
    }
  }
  // For non-video URLs or if we can't extract ID, return normalized URL
  return url.toLowerCase().trim()
}

// Helper function to parse AI response and extract attachments/links
function parseAIResponse(
  content: string,
  treeContext?: TreeContext
): {
  text: string
  attachments: Array<{ name: string; file_url: string; file_type: string | null; description: string | null }>
  links: Array<{ name: string; url: string; description: string | null; link_type: string | null }>
  videoUrls: Array<{ url: string; name?: string }>
} {
  const attachments: Array<{ name: string; file_url: string; file_type: string | null; description: string | null }> = []
  const links: Array<{ name: string; url: string; description: string | null; link_type: string | null }> = []
  const videoUrls: Array<{ url: string; name?: string }> = []

  if (!treeContext) {
    return { text: content, attachments, links, videoUrls }
  }

  // STEP 1: Collect ALL attachments from tree context and build normalized URL map
  const allAttachmentUrls = new Set<string>() // All attachment URLs (normalized) - prevents videoUrl extraction
  const attachmentMap = new Map<string, { name: string; file_url: string; file_type: string | null; description: string | null }>()
  
  treeContext.blocks.forEach(block => {
    block.nodes.forEach(node => {
      node.attachments.forEach(attachment => {
        if (!attachment.file_url) return
        const normalizedUrl = normalizeVideoUrl(attachment.file_url)
        allAttachmentUrls.add(normalizedUrl) // Add ALL attachment URLs immediately
        if (!attachmentMap.has(normalizedUrl)) {
          // Ensure file_url is string (not null) for type safety
          attachmentMap.set(normalizedUrl, {
            name: attachment.name,
            file_url: attachment.file_url, // Already checked for null above
            file_type: attachment.file_type,
            description: attachment.description
          })
        }
      })
    })
  })

  // STEP 2: Match attachments by name (simple matching)
  const contentLower = content.toLowerCase()
  attachmentMap.forEach((attachment) => {
    const nameLower = attachment.name.toLowerCase().trim()
    if (!nameLower) return
    
    // Simple match: name appears in content (as whole word for short names, or anywhere for longer)
    const isShortName = nameLower.length <= 2
    const isMatched = isShortName
      ? new RegExp(`\\b${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content)
      : contentLower.includes(nameLower)
    
    if (isMatched) {
      attachments.push(attachment)
    }
  })

  // STEP 3: Extract URLs from text - NEVER add to videoUrls if they match any attachment
  const urlRegex = /(https?:\/\/[^\s\)]+)/gi
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi
  const foundUrls = new Set<string>()

  // Extract markdown links
  let match
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    const url = match[2]
    foundUrls.add(url)
    const normalizedUrl = normalizeVideoUrl(url)
    const videoInfo = detectVideoType(url)
    
    if (videoInfo.type !== 'not_video' && !allAttachmentUrls.has(normalizedUrl)) {
      videoUrls.push({ url, name: match[1] })
    } else if (videoInfo.type === 'not_video') {
      // Check for matching link in tree context
      treeContext.blocks.forEach(block => {
        block.nodes.forEach(node => {
          node.links.forEach(link => {
            if (link.url === url && !links.find(l => l.url === url)) {
              links.push(link)
            }
          })
        })
      })
    }
  }

  // Extract plain URLs
  while ((match = urlRegex.exec(content)) !== null) {
    const url = match[1]
    if (foundUrls.has(url)) continue
    foundUrls.add(url)
    
    const normalizedUrl = normalizeVideoUrl(url)
    const videoInfo = detectVideoType(url)
    
    if (videoInfo.type !== 'not_video' && !allAttachmentUrls.has(normalizedUrl)) {
      videoUrls.push({ url })
    } else if (videoInfo.type === 'not_video') {
      // Check for matching link in tree context
      treeContext.blocks.forEach(block => {
        block.nodes.forEach(node => {
          node.links.forEach(link => {
            if (link.url === url && !links.find(l => l.url === url)) {
              links.push(link)
            }
          })
        })
      })
    }
  }

  // STEP 4: Deduplicate everything by normalized URL
  const uniqueAttachments = new Map<string, typeof attachments[0]>()
  attachments.forEach(attachment => {
    const normalizedUrl = normalizeVideoUrl(attachment.file_url)
    if (!uniqueAttachments.has(normalizedUrl)) {
      uniqueAttachments.set(normalizedUrl, attachment)
    }
  })

  const uniqueVideoUrls = new Map<string, typeof videoUrls[0]>()
  videoUrls.forEach(video => {
    const normalizedUrl = normalizeVideoUrl(video.url)
    // Final safety check: never add if it matches any attachment
    if (!uniqueVideoUrls.has(normalizedUrl) && !allAttachmentUrls.has(normalizedUrl)) {
      uniqueVideoUrls.set(normalizedUrl, video)
    }
  })

  const uniqueLinks = new Map<string, typeof links[0]>()
  links.forEach(link => {
    if (!uniqueLinks.has(link.url)) {
      uniqueLinks.set(link.url, link)
    }
  })

  return {
    text: content,
    attachments: Array.from(uniqueAttachments.values()),
    links: Array.from(uniqueLinks.values()),
    videoUrls: Array.from(uniqueVideoUrls.values()),
  }
}

export default function AIChatSidebar({ treeId, projectId, open, onOpenChange, initialQuery, onTreeUpdated, hasEditPermission = true }: AIChatSidebarProps) {
  const { user, loading: userLoading } = useUser()
  const { setIsChatOpen } = useChatSidebar()
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [currentMessage, setCurrentMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const initialQueryHandledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Storage key based on userId and treeId (per-user, per-tree)
  const storageKey = user ? `ai-chats-${user.id}-${treeId}` : null
  const sidebarWidthKey = user ? `ai-chat-sidebar-width-${user.id}-${treeId}` : null
  
  // Resizable sidebar state - initialize after user loads
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined' && sidebarWidthKey) {
      const saved = localStorage.getItem(sidebarWidthKey)
      return saved ? parseInt(saved, 10) : 512 // Default to 512px (lg)
    }
    return 512
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  
  // Update sidebar width when user loads
  useEffect(() => {
    if (!userLoading && sidebarWidthKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(sidebarWidthKey)
      if (saved) {
        setSidebarWidth(parseInt(saved, 10))
      }
    }
  }, [userLoading, sidebarWidthKey])

  // One-time cleanup of agentic localStorage data
  useEffect(() => {
    const cleanupKey = 'agentic_cleanup_done_v1'
    if (typeof window !== 'undefined' && !localStorage.getItem(cleanupKey)) {
      // Remove any action plan related keys
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.includes('action_plan') || key.includes('agent_mode')
      )
      keysToRemove.forEach(key => localStorage.removeItem(key))
      localStorage.setItem(cleanupKey, 'true')
      console.log('Cleaned up agentic localStorage data')
    }
  }, [])

  // Save chats to localStorage (only if user is authenticated)
  const saveChats = useCallback((updatedChats: Chat[]) => {
    setChats(updatedChats)
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(updatedChats))
    }
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
      if (storageKey) {
        localStorage.removeItem(storageKey)
      }
      setChats([])
      setActiveChatId(null)
    } else {
      saveChats(updated)
      if (activeChatId === chatId) {
        setActiveChatId(updated[0].id)
      }
    }
  }, [chats, activeChatId, saveChats, storageKey])

  // Rename a chat
  const startEditingTitle = useCallback((chatId: string, currentTitle: string) => {
    setEditingChatId(chatId)
    setEditingTitle(currentTitle)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }, [])

  const saveEditedTitle = useCallback((chatId: string) => {
    if (!editingTitle.trim()) {
      setEditingChatId(null)
      return
    }
    const updated = chats.map(chat => 
      chat.id === chatId 
        ? { ...chat, title: editingTitle.trim() }
        : chat
    )
    saveChats(updated)
    setEditingChatId(null)
    setEditingTitle("")
  }, [chats, editingTitle, saveChats])

  const cancelEditingTitle = useCallback(() => {
    setEditingChatId(null)
    setEditingTitle("")
  }, [])

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

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsSending(true)
    setCurrentMessage("")
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

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

      // Always route to ai-search endpoint (agentic features removed)
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
          signal,
        }
      )

      if (response.ok) {
        const data = await response.json()
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.answer || 'No answer available.',
          timestamp: new Date(),
          tree_context: data.tree_context, // Store tree context for parsing
          metadata: data.metadata // Store metadata for UI display
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
        // Handle 410 Gone (agentic chat disabled) gracefully
        if (response.status === 410) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage: ChatMessage = {
            role: 'assistant',
            content: errorData.message || 'This feature is no longer available. Please use the tree editor to make modifications.',
            timestamp: new Date()
          }
          const finalChats = updatedChats.map(chat => {
            if (chat.id === activeChatId) {
              return {
                ...chat,
                messages: [...chat.messages, errorMessage],
                updatedAt: new Date()
              }
            }
            return chat
          })
          saveChats(finalChats)
          setIsSending(false)
          setTimeout(() => inputRef.current?.focus(), 100)
          return
        }
        
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
      // Check if error is due to abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted')
        // Remove the user message that was just added since we're canceling
        const finalChats = chats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: chat.messages.filter((msg, idx) => idx < chat.messages.length - 1 || msg.role !== 'user'),
              updatedAt: new Date()
            }
          }
          return chat
        })
        saveChats(finalChats)
        return
      }
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
      abortControllerRef.current = null
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeChatId, chats, treeId, activeChat, saveChats, updateChatTitle, isSending])

  // Stop generation handler
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsSending(false)
  }, [])

  // Reset chats and ref when user changes (logout/login or user switch)
  useEffect(() => {
    if (!userLoading) {
      if (!user) {
        // User logged out - clear chats
        setChats([])
        setActiveChatId(null)
      }
      // Reset ref when user changes (allows reloading chats for new user)
      initialQueryHandledRef.current = false
    }
  }, [userLoading, user?.id]) // Use user?.id to detect user changes

  // Load chats from localStorage (only after user loads)
  useEffect(() => {
    if (open && !userLoading && user && storageKey && !initialQueryHandledRef.current) {
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
          if (storageKey) {
            localStorage.removeItem(storageKey)
          }
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
  }, [open, userLoading, user, storageKey, initialQuery, saveChats, createNewChat, sendMessage])

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

  // Handle Enter key (send on Enter, new line on Shift+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (currentMessage.trim() && !isSending) {
        sendMessage(currentMessage)
      }
    }
  }

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentMessage(e.target.value)
    // Auto-resize
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      const scrollHeight = inputRef.current.scrollHeight
      // Max height for ~5 lines (approximately 5 * line-height + padding)
      const maxHeight = 5 * 24 + 16 // ~5 lines at 24px line-height + 16px padding
      inputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (!isDragging) return

    let currentWidth = sidebarWidth

    const handleMouseMove = (e: MouseEvent) => {
      const diff = dragStartX.current - e.clientX // Inverted because sidebar is on the right
      const newWidth = Math.max(320, Math.min(1024, dragStartWidth.current + diff))
      currentWidth = newWidth
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      if (sidebarWidthKey) {
        localStorage.setItem(sidebarWidthKey, currentWidth.toString())
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, sidebarWidth, sidebarWidthKey])

  // Update chat sidebar context when open state changes
  useEffect(() => {
    setIsChatOpen(open)
  }, [open, setIsChatOpen])

  // Action plan functions removed - agentic features disabled

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Resizable Sidebar */}
      <div 
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-background border-l shadow-lg"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Drag Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group"
          onMouseDown={handleMouseDown}
        >
          {/* Visible indicator */}
          <div
            className={cn(
              "absolute left-0 top-0 bottom-0 w-0.5 bg-transparent group-hover:bg-primary/50 transition-colors",
              isDragging && "bg-primary"
            )}
          />
        </div>
        
        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 h-8 w-8"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        
        {/* Content */}
        <div className="flex flex-col h-full p-0 gap-0 overflow-hidden">
        
        {/* Chat Tabs Bar */}
        <div className="border-b flex-shrink-0 bg-background">
          {chats.length === 0 ? (
            <div className="px-4 py-3 flex items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={createNewChat}
                className="h-9 px-4 flex items-center gap-2"
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
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-background text-foreground hover:bg-muted border border-border"
                  )}
                >
                  {editingChatId === chat.id ? (
                    <>
                      <Input
                        ref={titleInputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveEditedTitle(chat.id)
                          } else if (e.key === 'Escape') {
                            cancelEditingTitle()
                          }
                        }}
                        onBlur={() => saveEditedTitle(chat.id)}
                        className="h-6 px-2 text-sm flex-1 min-w-0 max-w-[180px]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          saveEditedTitle(chat.id)
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
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
                          activeChatId === chat.id ? "text-primary-foreground hover:bg-primary/80" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingTitle(chat.id, chat.title)
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-5 w-5 p-0 opacity-70 hover:opacity-100 flex-shrink-0",
                          activeChatId === chat.id ? "text-primary-foreground hover:bg-primary/80" : "text-muted-foreground hover:text-destructive"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteChat(chat.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              
              {/* New Chat Button - Only show if less than MAX_CHATS */}
              {chats.length < MAX_CHATS && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createNewChat}
                  className="h-9 px-3 flex items-center gap-1.5 flex-shrink-0"
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
                  <div className="flex flex-col items-center justify-center py-12 px-4">
                    <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-foreground font-medium mb-1">Start a conversation</p>
                    <p className="text-sm text-muted-foreground mb-6">Ask questions about this experiment tree</p>
                    
                    {/* Suggested Questions */}
                    <div className="w-full max-w-md space-y-2">
                      <p className="text-xs font-medium text-foreground/70 mb-3 text-center">Suggested questions:</p>
                      {[
                        "Summarise this experiment tree",
                        "What suggestions do you have for improving this tree?",
                        "Explain the Protocol block",
                        "What are the dependencies between nodes?",
                        "What data collection methods are used?"
                      ].map((suggestion, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-left h-auto py-2.5 px-3 text-sm text-foreground hover:bg-muted hover:text-foreground border-border"
                          onClick={() => sendMessage(suggestion)}
                        >
                          <span className="flex-1 text-left">{suggestion}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  (() => {
                    // Find the index of the last user message once
                    let lastUserMessageIndex = -1
                    if (activeChat) {
                      for (let i = activeChat.messages.length - 1; i >= 0; i--) {
                        if (activeChat.messages[i].role === 'user') {
                          lastUserMessageIndex = i
                          break
                        }
                      }
                    }
                    return activeChat.messages.map((message, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex group",
                          message.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-4 py-2 relative",
                            message.role === 'user'
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground border border-border"
                          )}
                        >
                          {/* Copy button - always visible, positioned inside the message box */}
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(message.content)
                              setCopiedMessageIndex(index)
                              setTimeout(() => setCopiedMessageIndex(null), 2000)
                            }}
                            className={cn(
                              "absolute p-1 z-10",
                              message.role === 'user' 
                                ? "top-2 left-2" // User messages (right side): top-left inside
                                : "top-2 right-2" // AI messages (left side): top-right inside
                            )}
                            aria-label="Copy message"
                          >
                            {copiedMessageIndex === index ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-foreground" />
                            )}
                          </button>
                          {/* Regenerate button - only for the last user message in the chat, aligns with second line or inline if both fit */}
                          {message.role === 'user' && index === lastUserMessageIndex && (
                          <button
                            onClick={async () => {
                              // Remove this message and all subsequent messages, then re-send
                              const updatedChats = chats.map(chat => {
                                if (chat.id === activeChatId) {
                                  return {
                                    ...chat,
                                    messages: chat.messages.slice(0, index + 1),
                                    updatedAt: new Date()
                                  }
                                }
                                return chat
                              })
                              saveChats(updatedChats)
                              // Wait a bit for state to update, then re-send the message
                              setTimeout(() => {
                                sendMessage(message.content)
                              }, 100)
                            }}
                            className="absolute top-[calc(1.5rem+1.625*0.875rem-0.5rem)] left-2 p-1 z-20"
                            aria-label="Regenerate response"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-foreground" />
                          </button>
                        )}
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={12} className="text-primary" />
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI</span>
                          </div>
                        )}
                        {message.role === 'assistant' ? (() => {
                          const parsed = parseAIResponse(message.content, message.tree_context)
                          return (
                            <div className="space-y-3">
                              <div className="text-sm leading-relaxed max-w-none">
                                <ReactMarkdown
                                  components={{
                                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                    h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-base font-bold mb-3 mt-4 first:mt-0">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                                    ul: ({ children }) => (
                                      <ul className="mb-4 space-y-2.5 pl-5 [&>li]:list-disc [&>li]:marker:text-muted-foreground/50 [&>li]:marker:text-sm">
                                        {children}
                                      </ul>
                                    ),
                                    ol: ({ children }) => (
                                      <ol className="mb-4 space-y-2.5 pl-5 list-decimal [&>li]:marker:text-muted-foreground/50 [&>li]:marker:font-medium [&>li]:marker:text-sm">
                                        {children}
                                      </ol>
                                    ),
                                    li: ({ children }) => {
                                      return (
                                        <li className="mb-2.5 last:mb-0 leading-relaxed pl-1">
                                          {children}
                                        </li>
                                      )
                                    },
                                    code: ({ children, className }) => {
                                      const isInline = !className
                                      return isInline ? (
                                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                      ) : (
                                        <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto mb-2">{children}</code>
                                      )
                                    },
                                    pre: ({ children }) => <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
                                    blockquote: ({ children }) => <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic mb-2">{children}</blockquote>,
                                    a: ({ href, children }) => <a href={href} className="text-primary underline hover:text-primary/80" target="_blank" rel="noopener noreferrer">{children}</a>,
                                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                    em: ({ children }) => <em className="italic">{children}</em>,
                                  }}
                                >
                                  {parsed.text}
                                </ReactMarkdown>
                              </div>
                              
                              {/* Metadata notification for semantic search */}
                              {message.metadata?.used_semantic_search && (
                                <div className="text-xs text-muted-foreground mt-3 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="flex-1">
                                      Analyzed {message.metadata.context_nodes} of {message.metadata.total_nodes} most relevant nodes.
                                      {message.metadata.context_strategy === 'semantic' && message.metadata.context_nodes && message.metadata.total_nodes && message.metadata.context_nodes < message.metadata.total_nodes && (
                                        <button 
                                          onClick={() => {
                                            // Find the original user query that generated this response
                                            const originalQuery = activeChat?.messages.find((m, i) => i < index && m.role === 'user')?.content || ''
                                            if (originalQuery) {
                                              // Prepend "search all nodes" to force full context
                                              // This will trigger requiresFullContext() detection
                                              const fullContextQuery = `search all nodes: ${originalQuery}`
                                              // Directly send the message
                                              sendMessage(fullContextQuery)
                                            }
                                          }}
                                          className="ml-2 underline hover:no-underline text-blue-700 dark:text-blue-300 font-medium"
                                        >
                                          Search all nodes
                                        </button>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              {/* Render embedded videos */}
                              {parsed.videoUrls.length > 0 && (
                                <div className="space-y-2 mt-3">
                                  {parsed.videoUrls.map((video, idx) => (
                                    <VideoEmbed
                                      key={idx}
                                      url={video.url}
                                      title={video.name}
                                      className="w-full"
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Render attachments */}
                              {parsed.attachments.length > 0 && (
                                <div className="space-y-2 mt-3">
                                  {parsed.attachments.map((attachment, idx) => {
                                    const videoInfo = detectVideoType(attachment.file_url || '')
                                    if (videoInfo.type !== 'not_video') {
                                      return (
                                        <VideoEmbed
                                          key={idx}
                                          url={attachment.file_url || ''}
                                          title={attachment.name}
                                          type={attachment.file_type || undefined}
                                          className="w-full"
                                        />
                                      )
                                    }
                                    return (
                                      <a
                                        key={idx}
                                        href={attachment.file_url || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-2 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                                      >
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{attachment.name}</p>
                                          {attachment.description && (
                                            <p className="text-xs text-muted-foreground truncate">{attachment.description}</p>
                                          )}
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      </a>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Render links */}
                              {parsed.links.length > 0 && (
                                <div className="space-y-2 mt-3">
                                  {parsed.links.map((link, idx) => (
                                    <a
                                      key={idx}
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                                    >
                                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{link.name}</p>
                                        {link.description && (
                                          <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                                      </div>
                                      <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })() : (
                          <p className={cn(
                            "text-sm leading-relaxed whitespace-pre-wrap",
                            message.role === 'user' && "pl-6 pt-6"
                          )}>{message.content}</p>
                        )}
                        </div>
                      </div>
                    ))
                  })()
                )}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2 border border-border">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                        <span className="text-sm text-foreground">Thinking...</span>
                        <button
                          onClick={handleStopGeneration}
                          className="ml-2 p-1 rounded hover:bg-muted-foreground/10 transition-colors"
                          aria-label="Stop generation"
                        >
                          <Square className="h-3 w-3 text-foreground fill-current" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Action plan preview removed - agentic features disabled */}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t p-4 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={currentMessage}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question..."
                    disabled={isSending}
                    className="flex-1 min-h-[36px] max-h-[136px] resize-none overflow-y-auto"
                    rows={1}
                  />
                  {/* Agent mode toggle removed - agentic features disabled */}
                  <Button
                    onClick={() => sendMessage(currentMessage)}
                    disabled={!currentMessage.trim() || isSending}
                    className="flex-shrink-0"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-foreground font-medium text-lg mb-2">Start a chat to learn about the experiment tree</p>
              <p className="text-sm text-muted-foreground">Ask questions about nodes, blocks, and relationships</p>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  )
}


