"use client"

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Publication } from '@/lib/types'

interface PublicationSearchProps {
  publications: Publication[]
  onFilteredResults: (filtered: Publication[]) => void
}

export function PublicationSearch({ publications, onFilteredResults }: PublicationSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Debounced search with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, publications])

  const performSearch = () => {
    if (!searchQuery.trim()) {
      onFilteredResults(publications)
      return
    }

    const query = searchQuery.toLowerCase().trim()
    
    const filtered = publications.filter(publication => {
      // Search across multiple fields
      const searchableText = [
        publication.title,
        publication.journal_title,
        publication.doi,
        publication.abstract,
        ...(publication.authors || [])
      ].join(' ').toLowerCase()

      return searchableText.includes(query)
    })

    onFilteredResults(filtered)
  }

  const handleClear = () => {
    setSearchQuery('')
    onFilteredResults(publications)
  }

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search publications by title, authors, journal, DOI, or abstract..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
