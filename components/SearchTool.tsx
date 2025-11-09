"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { supabase } from "@/lib/supabase-client"
import { Sparkles } from "lucide-react"
// import { cn } from "@/lib/utils"
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentTextIcon,
  PaperClipIcon,
  LinkIcon,
  TagIcon,
  ArrowRightIcon,
  ClockIcon,
} from "@heroicons/react/24/outline"

interface SearchResult {
  id: string
  type: 'block' | 'node' | 'attachment' | 'link' | 'content'
  title: string
  description?: string
  content?: string
  nodeType?: string
  nodeId?: string
  nodeTitle?: string
  blockId?: string
  blockName?: string
  path: string[]
  matchType: 'title' | 'description' | 'content' | 'attachment' | 'link' | 'block'
  score: number
  sectionName?: string
  sectionId?: string
}


interface SearchToolProps {
  treeId: string
  projectId?: string
  onNodeSelect: (nodeId: string, sectionId?: string) => void
  onAIChatOpen?: () => void
  className?: string
}

export default function SearchTool({ treeId, projectId, onNodeSelect, onAIChatOpen, className }: SearchToolProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showResults, setShowResults] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  
  
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Load search history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem(`search-history-${treeId}`)
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to parse search history:', e)
      }
    }
  }, [treeId])

  // Save search history to localStorage
  const saveSearchHistory = useCallback((newHistory: string[]) => {
    setSearchHistory(newHistory)
    localStorage.setItem(`search-history-${treeId}`, JSON.stringify(newHistory))
  }, [treeId])

  // Add search to history
  const addToHistory = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return
    
    const trimmedTerm = searchTerm.trim()
    setSearchHistory(prev => {
      const newHistory = [trimmedTerm, ...prev.filter(term => term !== trimmedTerm)].slice(0, 5)
      saveSearchHistory(newHistory)
      return newHistory
    })
  }, [saveSearchHistory])

  // Debounced search function (keyword search)
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/trees/${treeId}/search?q=${encodeURIComponent(searchQuery)}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        setShowResults(true)
        setSelectedIndex(-1)
      }
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [treeId])


  // Remove search from history
  const removeFromHistory = useCallback((searchTerm: string) => {
    const newHistory = searchHistory.filter(term => term !== searchTerm)
    saveSearchHistory(newHistory)
  }, [searchHistory, saveSearchHistory])

  // Handle input focus - show history if no query
  const handleInputFocus = () => {
    if (!query.trim() && searchHistory.length > 0) {
      setShowHistory(true)
      setShowResults(false)
    }
  }

  // Handle input changes with debouncing (only for keyword search)
  const handleInputChange = (value: string) => {
    setQuery(value)
    
    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    if (value.trim()) {
      setShowHistory(false)
      // Set new timeout for keyword search
      debounceRef.current = setTimeout(() => {
        performSearch(value)
      }, 300)
    } else {
      setResults([])
      setShowResults(false)
      setShowHistory(true)
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        if (showResults && selectedIndex >= 0 && results[selectedIndex]) {
          // Navigate to selected result
          handleResultClick(results[selectedIndex])
        } else if (query.trim()) {
          // If no selection but has query, perform keyword search
          performSearch(query)
        }
        break
      case 'ArrowDown':
        if (showResults) {
          e.preventDefault()
          setSelectedIndex(prev => 
            prev < results.length - 1 ? prev + 1 : prev
          )
        }
        break
      case 'ArrowUp':
        if (showResults) {
          e.preventDefault()
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setQuery("")
        setResults([])
        setShowResults(false)
        setShowHistory(false)
        setSelectedIndex(-1)
        break
    }
  }

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    // Add search to history
    addToHistory(query)
    
    if (result.type === 'block') {
      // For blocks, we could scroll to the block or expand it
      // For now, just close the search
      setIsOpen(false)
      setQuery("")
      setResults([])
      setShowResults(false)
      setSelectedIndex(-1)
    } else if (result.nodeId) {
      // Navigate to node with section information
      onNodeSelect(result.nodeId, result.sectionId)
      setIsOpen(false)
      setQuery("")
      setResults([])
      setShowResults(false)
      setSelectedIndex(-1)
    }
  }

  // Handle global keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false)
        setShowHistory(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get result icon
  const getResultIcon = (result: SearchResult) => {
    switch (result.type) {
      case 'block':
        return <TagIcon className="h-4 w-4" />
      case 'node':
        return <DocumentTextIcon className="h-4 w-4" />
      case 'attachment':
        return <PaperClipIcon className="h-4 w-4" />
      case 'link':
        return <LinkIcon className="h-4 w-4" />
      case 'content':
        return <DocumentTextIcon className="h-4 w-4" />
      default:
        return <DocumentTextIcon className="h-4 w-4" />
    }
  }

  // Get result type color
  const getResultTypeColor = (result: SearchResult) => {
    switch (result.type) {
      case 'block':
        return "bg-indigo-100 text-indigo-800"
      case 'node':
        return "bg-blue-100 text-blue-800"
      case 'attachment':
        return "bg-green-100 text-green-800"
      case 'link':
        return "bg-purple-100 text-purple-800"
      case 'content':
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-300 text-yellow-900 px-1 py-0.5 rounded font-semibold">
          {part}
        </mark>
      ) : part
    )
  }

  // Simple className helper
  const cn = (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' ')
  
  return (
    <div className={cn("relative", className)} ref={resultsRef}>
      {/* Search Button/Input */}
      {!isOpen ? (
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(true)}
                  className="h-9 px-3 flex items-center space-x-2 bg-blue-50 border-blue-300 hover:bg-blue-100 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-400 text-blue-700"
                >
                  <MagnifyingGlassIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-700 hidden sm:inline">Search...</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Search experiment tree (⌘K)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
              <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-xs font-mono">⌘K</kbd>
              <span className="ml-1">to search</span>
            </div>
            {onAIChatOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAIChatOpen}
                className="h-9 px-3 flex items-center space-x-2 border-purple-300 hover:bg-purple-50 hover:border-purple-500 text-purple-700"
                title="Open AI Chat"
              >
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">AI Chat</span>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center space-x-2">
            <div className="relative">
              {loading ? (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                </div>
              ) : (
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              )}
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes, content, attachments..."
          className="w-96 pl-10 pr-20 h-10 text-base border-2 border-blue-300 focus:border-blue-500 shadow-lg"
          autoFocus
        />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-gray-100"
                  onClick={() => {
                    setIsOpen(false)
                    setQuery("")
                    setResults([])
                    setShowResults(false)
                    setShowHistory(false)
                    setSelectedIndex(-1)
                  }}
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Results Dropdown */}
      {isOpen && (showResults || showHistory) && (
        <div className="absolute top-full right-0 mt-2 w-[500px] max-h-[500px] overflow-y-auto z-50 bg-white border-2 border-gray-200 rounded-lg shadow-2xl animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div className="p-0">
            {showHistory && searchHistory.length > 0 ? (
              <div className="py-2">
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">Recent searches</p>
                </div>
                {searchHistory.map((historyItem, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setQuery(historyItem)
                      setShowHistory(false)
                      performSearch(historyItem)
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <ClockIcon className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{historyItem}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromHistory(historyItem)
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : loading ? (
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                <p className="text-gray-600 font-medium">Searching...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center">
                <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No results found</p>
                <p className="text-sm text-gray-500 mt-1">Try different keywords or check spelling</p>
              </div>
            ) : (
              <div className="py-2">
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">
                    {results.length} result{results.length !== 1 ? 's' : ''} found
                  </p>
                </div>
                {results.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className={cn(
                      "flex items-start space-x-4 p-4 cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0",
                      selectedIndex === index && "bg-blue-50 border-l-4 border-l-blue-500"
                    )}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        {getResultIcon(result)}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="mb-2">
                        <div className="text-base font-semibold text-gray-900 truncate mb-1">
                          {highlightText(result.nodeTitle || result.blockName || result.title, query)}
                        </div>
                        <div className="flex items-center space-x-2">
                          {result.blockName && (
                            <span className="text-sm text-blue-600 font-medium">
                              {result.blockName}
                            </span>
                          )}
                          <Badge className={cn("text-xs px-2 py-1", getResultTypeColor(result))}>
                            {result.type}
                          </Badge>
                        </div>
                      </div>
                      
                      {result.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {highlightText(result.description, query)}
                        </p>
                      )}
                      
                      {result.content && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2 bg-gray-50 p-2 rounded">
                          {highlightText(result.content, query)}
                        </p>
                      )}
                      
                      <div className="flex items-center space-x-1 text-xs text-gray-500">
                        <span>Found in:</span>
                        {result.path && result.path.length > 0 ? (
                          <div className="flex items-center space-x-1">
                            {result.path.map((pathItem, index) => (
                              <span key={index} className="flex items-center space-x-1">
                                <span className="font-medium text-blue-600">{pathItem}</span>
                                {index < result.path.length - 1 && <ArrowRightIcon className="h-3 w-3" />}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="font-medium text-blue-600">{result.nodeTitle || result.blockName || result.title}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
