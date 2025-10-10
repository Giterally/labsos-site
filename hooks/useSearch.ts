import { useState, useCallback, useRef } from 'react'

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

interface UseSearchOptions {
  treeId: string
  debounceMs?: number
}

interface UseSearchReturn {
  query: string
  results: SearchResult[]
  loading: boolean
  error: string | null
  search: (query: string) => void
  clearSearch: () => void
  isSearching: boolean
}

export function useSearch({ treeId, debounceMs = 300 }: UseSearchOptions): UseSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)
    setIsSearching(true)

    try {
      const response = await fetch(
        `/api/trees/${treeId}/search?q=${encodeURIComponent(searchQuery)}`,
        { signal: abortControllerRef.current.signal }
      )

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return
      }
      
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [treeId])

  const search = useCallback((searchQuery: string) => {
    setQuery(searchQuery)
    
    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Set new timeout
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery)
    }, debounceMs)
  }, [performSearch, debounceMs])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
    setIsSearching(false)
    
    // Clear timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    query,
    results,
    loading,
    error,
    search,
    clearSearch,
    isSearching
  }
}
