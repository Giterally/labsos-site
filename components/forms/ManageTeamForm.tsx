"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon, CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { supabase } from "@/lib/supabase-client"

interface TeamMember {
  id: string
  user_id: string
  name: string
  email: string
  lab_name: string
  role: string
  initials: string
  joined_at: string
}

interface User {
  id: string
  name: string
  email: string
  lab_name: string
  initials: string
}

interface ManageTeamFormProps {
  projectId: string
  onTeamUpdated?: () => void
}

export default function ManageTeamForm({ projectId, onTeamUpdated }: ManageTeamFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    if (open) {
      fetchTeamMembers()
    }
  }, [open, projectId])

  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/projects/${projectId}/team`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch team members')
      }

      const { members } = await response.json()
      setTeamMembers(members || [])
    } catch (err: any) {
      setError(err.message || "Failed to fetch team members")
    } finally {
      setLoading(false)
    }
  }

  const searchUsers = async (search: string) => {
    if (!search.trim()) {
      setSearchResults([])
      return
    }

    try {
      setSearchLoading(true)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/users/search?search=${encodeURIComponent(search)}&limit=10&projectId=${encodeURIComponent(projectId)}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to search users')
      }

      const { users } = await response.json()
      setSearchResults(users || [])
    } catch (err: any) {
      console.error('Error searching users:', err)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const addTeamMember = async (user: User) => {
    try {
      setLoading(true)
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
        throw new Error(errorData.message || 'Failed to add team member')
      }

      const { member } = await response.json()
      setTeamMembers(prev => [...prev, member])
      setSearchTerm("")
      setSearchResults([])
      setSearchOpen(false)
      
      if (onTeamUpdated) {
        onTeamUpdated()
      }
    } catch (err: any) {
      setError(err.message || "Failed to add team member")
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    searchUsers(value)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserGroupIcon className="h-4 w-4 mr-2" />
          Manage Team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Team Members</DialogTitle>
          <DialogDescription>
            Add team members to give them full edit access to this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add Team Member */}
          <div className="space-y-2">
            <Label>Add Team Member</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-between"
                >
                  {searchTerm ? `Searching for "${searchTerm}"...` : "Search for users..."}
                  <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search by name, email, or lab..."
                    value={searchTerm}
                    onValueChange={handleSearchChange}
                  />
                  <CommandList>
                    {searchLoading ? (
                      <CommandEmpty>Searching...</CommandEmpty>
                    ) : searchResults.length === 0 ? (
                      <CommandEmpty>
                        {searchTerm ? "No users found" : "Start typing to search for users"}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {searchResults.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={user.id}
                            onSelect={() => addTeamMember(user)}
                            className="flex items-center space-x-3 p-3"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {user.initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {user.email} • {user.lab_name}
                              </div>
                            </div>
                            <CheckIcon className="h-4 w-4" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Current Team Members */}
          <div className="space-y-2">
            <Label>Current Team Members ({teamMembers.length})</Label>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading team members...
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No team members yet
                </div>
              ) : (
                teamMembers.map((member) => (
                  <Card key={member.id} className="p-3">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-sm">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {member.email} • {member.lab_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {member.role}
                      </Badge>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}