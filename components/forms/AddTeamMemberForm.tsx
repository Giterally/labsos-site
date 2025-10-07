"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CheckIcon, ChevronDownIcon, UserPlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { supabase } from "@/lib/supabase-client"

interface User {
  id: string
  name: string
  email: string
  lab_name: string
  initials: string
}

interface AddTeamMemberFormProps {
  projectId: string
  onMemberAdded: () => void
}

export default function AddTeamMemberForm({ projectId, onMemberAdded }: AddTeamMemberFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Debounced search function
  const debouncedSearch = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout
      return (query: string) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => searchUsers(query), 300)
      }
    })(),
    []
  )

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    try {
      setSearchLoading(true)
      setError(null)
      
      // Get the current session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.access_token) {
        throw new Error('Authentication required')
      }

      // Search with project exclusion
      const response = await fetch(`/api/users/search?search=${encodeURIComponent(query)}&limit=20&projectId=${encodeURIComponent(projectId)}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to search users')
      }
      
      const data = await response.json()
      setSearchResults(data.users || [])
    } catch (err) {
      console.error('Error searching users:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const addTeamMember = async (user: User) => {
    try {
      setLoading(true)
      setError(null)
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/projects/${projectId}/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (response.status === 400) {
          throw new Error(errorData.message || 'This user is already a team member')
        }
        throw new Error(errorData.message || 'Failed to add team member')
      }

      // Success! Reset form and close
      setSearchTerm("")
      setSearchResults([])
      setOpen(false)
      onMemberAdded()
    } catch (err: any) {
      setError(err.message || "Failed to add team member")
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setError(null) // Clear any previous errors when starting a new search
    debouncedSearch(value)
  }

  // Reset search when popover closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("")
      setSearchResults([])
      setError(null)
    } else {
      // Clear error when popover opens
      setError(null)
    }
  }, [open])

  return (
    <div className="flex items-center space-x-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center space-x-1"
            disabled={loading}
          >
            <UserPlusIcon className="h-4 w-4" />
            <span>Add Member</span>
            <ChevronDownIcon className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-4" align="start">
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or lab..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 h-10"
                autoFocus
              />
            </div>

            {/* Search Results */}
            <div className="max-h-80 overflow-y-auto">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : error ? (
                <div className="text-center py-6">
                  <div className="text-sm text-red-600 mb-2">
                    {error.includes('already a team member') ? 'Already Added' : 'Error'}
                  </div>
                  <div className="text-xs text-muted-foreground">{error}</div>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-sm text-muted-foreground">
                    {searchTerm ? "No users found" : "Start typing to search for users"}
                  </div>
                  {searchTerm && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Try different keywords or check spelling
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground px-1">
                    {searchResults.length} user{searchResults.length !== 1 ? 's' : ''} found
                  </div>
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => addTeamMember(user)}
                      className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-sm font-medium">
                          {user.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user.lab_name}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                        <span>Add</span>
                        <CheckIcon className="h-3 w-3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
