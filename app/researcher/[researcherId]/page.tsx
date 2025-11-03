"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeftIcon,
  BeakerIcon,
  UserGroupIcon,
  AcademicCapIcon,
  MapPinIcon,
  CalendarIcon,
  LinkIcon,
  FolderIcon,
  CodeBracketIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  CircleStackIcon,
  ShareIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { Linkedin, Github } from 'lucide-react'
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth-service"
import { useUser } from "@/lib/user-context"
import { supabase } from "@/lib/supabase-client"
import { ORCIDImport } from "@/components/ORCIDImport"
import { PublicationSearch } from "@/components/PublicationSearch"
import { PublicationForm } from "@/components/PublicationForm"
import { PublicationListItem } from "@/components/PublicationListItem"
import { BulkActionsToolbar } from "@/components/BulkActionsToolbar"
import { Publication } from "@/lib/types"

interface ResearcherProfile {
  id: string
  name: string
  title: string
  email: string
  bio: string
  avatar?: string
  institution: string
  department: string
  location: string
  website?: string
  linkedin?: string
  github?: string
  orcid?: string
  joinedDate: string
  lastActive: string
  currentProjects: Array<{
    id: string
    name: string
    description: string
    status: "active" | "completed" | "paused"
    role: string
    startDate: string
    endDate?: string
    project: {
      id: string
      name: string
    }
  }>
  pastProjects: Array<{
    id: string
    name: string
    description: string
    status: "completed" | "archived"
    role: string
    startDate: string
    endDate: string
    project: {
      id: string
      name: string
    }
  }>
  publications: Publication[]
  skills: string[]
  interests: string[]
  stats: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    publications: number
    collaborations: number
  }
}

export default function ResearcherProfilePage() {
  const router = useRouter()
  const params = useParams()
  const researcherId = params.researcherId as string
  const { user: currentUser, refreshUser } = useUser()

  const [researcher, setResearcher] = useState<ResearcherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<ResearcherProfile>>({})
  const [saving, setSaving] = useState(false)
  
  // Publication management state
  const [filteredPublications, setFilteredPublications] = useState<Publication[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showPublicationForm, setShowPublicationForm] = useState(false)
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null)
  
  // Delete profile state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteStats, setDeleteStats] = useState<{soloProjects: number, publications: number, trees: number} | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false)

  useEffect(() => {
    // Check if this is the user's own profile
    if (currentUser && researcherId) {
      setIsOwnProfile(currentUser.id === researcherId)
    } else {
      setIsOwnProfile(false)
    }
    setIsAuthenticated(!!currentUser)
    setAuthLoading(false)
  }, [currentUser, researcherId])

  const fetchResearcher = async () => {
    try {
      const response = await fetch(`/api/researcher/${researcherId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Researcher profile not found')
        } else {
          setError('Failed to load researcher profile')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setResearcher(data.researcher)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching researcher:', err)
      setError('Failed to load researcher profile')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (researcherId) {
      fetchResearcher()
    }
  }, [researcherId])

  // Initialize edit data when researcher data loads, but only if not currently editing
  useEffect(() => {
    if (researcher && !isEditing) {
      setEditData({
        name: researcher.name,
        title: researcher.title,
        bio: researcher.bio,
        institution: researcher.institution,
        department: researcher.department,
        location: researcher.location,
        website: researcher.website,
        linkedin: researcher.linkedin,
        github: researcher.github,
        orcid: researcher.orcid,
        skills: [...researcher.skills],
        interests: [...researcher.interests],
      })
    }
    
    // Always update filtered publications when researcher changes
    if (researcher) {
      setFilteredPublications(researcher.publications || [])
    }
  }, [researcher, isEditing])

  // Calculate delete statistics when dialog opens
  useEffect(() => {
    if (showDeleteDialog && isOwnProfile && researcherId) {
      const calculateStats = async () => {
        try {
          const { data: session } = await supabase.auth.getSession()
          if (!session?.session?.access_token) return

          // Get user's project memberships
          const response = await fetch(`/api/researcher/${researcherId}`)
          if (!response.ok) return

          const { researcher: profileData } = await response.json()
          
          // Get projects where user is a member
          const { data: projectMemberships } = await supabase
            .from('project_members')
            .select('project_id, left_at')
            .eq('user_id', researcherId)
            .is('left_at', null)

          if (!projectMemberships || projectMemberships.length === 0) {
            setDeleteStats({
              soloProjects: 0,
              publications: profileData.publications?.length || 0,
              trees: 0
            })
            return
          }

          const projectIds = projectMemberships.map(pm => pm.project_id)

          // Get all members for these projects
          const { data: allMembers } = await supabase
            .from('project_members')
            .select('project_id, user_id, left_at')
            .in('project_id', projectIds)

          // Count active members per project
          const projectMemberCounts = new Map<string, number>()
          allMembers?.forEach(member => {
            if (!member.left_at) {
              const count = projectMemberCounts.get(member.project_id) || 0
              projectMemberCounts.set(member.project_id, count + 1)
            }
          })

          // Find solo projects (only 1 active member)
          let soloProjectsCount = 0
          projectMemberCounts.forEach((count) => {
            if (count === 1) {
              soloProjectsCount++
            }
          })

          setDeleteStats({
            soloProjects: soloProjectsCount,
            publications: profileData.publications?.length || 0,
            trees: 0 // Can be enhanced later if needed
          })
        } catch (error) {
          console.error('Error calculating delete stats:', error)
          // Set default stats on error
          setDeleteStats({
            soloProjects: 0,
            publications: researcher?.publications?.length || 0,
            trees: 0
          })
        }
      }

      calculateStats()
    }
  }, [showDeleteDialog, isOwnProfile, researcherId, researcher?.publications?.length])

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to original data
      if (researcher) {
        setEditData({
          name: researcher.name,
          title: researcher.title,
          bio: researcher.bio,
          institution: researcher.institution,
          department: researcher.department,
          location: researcher.location,
          website: researcher.website,
          linkedin: researcher.linkedin,
          github: researcher.github,
          orcid: researcher.orcid,
          skills: [...researcher.skills],
          interests: [...researcher.interests],
        })
      }
    }
    setIsEditing(!isEditing)
  }

  const handleSave = async () => {
    if (!researcher || !currentUser) return
    
    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          full_name: editData.name,
          bio: editData.bio,
          institution: editData.institution,
          department: editData.department,
          location: editData.location,
          website: editData.website,
          linkedin: editData.linkedin,
          github: editData.github,
          orcid: editData.orcid,
          skills: editData.skills,
          interests: editData.interests,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save profile')
      }

      const result = await response.json()
      console.log('Profile saved successfully:', result)
      
      // Wait a brief moment for database to fully commit
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Update local state with the saved data and recalculate avatar
      const updatedResearcher = {
        ...researcher,
        ...editData,
        avatar: editData.name ? editData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : researcher.avatar
      }
      setResearcher(updatedResearcher)
      
      // Refresh user context to update header avatar
      await refreshUser()
      
      // Refresh researcher data to ensure other users see updated profile
      const refreshResponse = await fetch(`/api/researcher/${researcherId}`)
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        setResearcher(refreshData.researcher)
      }
      
      setIsEditing(false)
    } catch (error) {
      console.error('Error saving profile:', error)
      // TODO: Show error message to user
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleArrayFieldChange = (field: 'skills' | 'interests', value: string[]) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const addArrayItem = (field: 'skills' | 'interests', value: string) => {
    if (!value.trim()) return
    const currentArray = editData[field] || []
    if (!currentArray.includes(value.trim())) {
      handleArrayFieldChange(field, [...currentArray, value.trim()])
    }
  }

  const removeArrayItem = (field: 'skills' | 'interests', index: number) => {
    const currentArray = editData[field] || []
    handleArrayFieldChange(field, currentArray.filter((_, i) => i !== index))
  }

  // Publication management handlers
  const handleSearch = (filtered: Publication[]) => {
    setFilteredPublications(filtered)
    // Clear selection when search results change
    setSelectedIds(new Set())
  }

  const handleSelectPublication = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredPublications.length && filteredPublications.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPublications.map(p => p.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/publications/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ publicationIds: Array.from(selectedIds) }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete publications')
      }

      // Refresh data
      await fetchResearcher()
      setSelectedIds(new Set())
    } catch (error: any) {
      console.error('Error deleting publications:', error)
      alert(error.message || 'Failed to delete publications')
    }
  }

  const handleDeletePublication = async (id: string) => {
    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/publications/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete publication')
      }

      // Refresh data
      await fetchResearcher()
    } catch (error: any) {
      console.error('Error deleting publication:', error)
      alert(error.message || 'Failed to delete publication')
    }
  }

  const handleSavePublication = async (publication: Publication) => {
    // Refresh data to get updated publications
    await fetchResearcher()
    setShowPublicationForm(false)
    setEditingPublication(null)
  }

  const handleDeleteProfile = async () => {
    setIsDeleting(true)
    
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/profile/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`
        },
        body: JSON.stringify({
          confirmationText: deleteConfirmation
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete profile')
      }

      // Show success message and redirect
      setShowDeleteDialog(false)
      setShowDeleteSuccess(true)
      
      // Sign out and redirect after 3 seconds
      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/')
      }, 3000)
      
    } catch (error) {
      console.error('Error deleting profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete profile')
      setIsDeleting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "paused":
        return "bg-yellow-100 text-yellow-800"
      case "archived":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Profile...</h1>
          <p className="text-muted-foreground">Please wait while we fetch the researcher's information.</p>
        </div>
      </div>
    )
  }

  if (error || !researcher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Profile Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The researcher profile you're looking for doesn't exist."}
          </p>
          <Button onClick={() => router.push("/")}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${isOwnProfile ? 'bg-background' : 'bg-background'}`}>
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold text-foreground">
                {isOwnProfile ? "My Profile" : "Researcher Profile"}
              </span>
              {isOwnProfile && (
                <Badge variant="secondary" className="text-xs">
                  You
                </Badge>
              )}
            </div>
          </div>
          {!isAuthenticated && (
            <Button variant="outline" onClick={() => (window.location.href = "/login")}>
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Card */}
            <Card className={isOwnProfile ? "ring-2 ring-primary/20" : ""}>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <Avatar className="h-24 w-24 mx-auto">
                    <AvatarFallback className="text-2xl font-semibold bg-primary text-primary-foreground">
                      {researcher.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={editData.name || ''}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="text-2xl font-bold text-center"
                          placeholder="Full Name"
                        />
                        <Input
                          value={editData.title || ''}
                          onChange={(e) => handleInputChange('title', e.target.value)}
                          className="text-lg text-center"
                          placeholder="Title/Position"
                        />
                        <Input
                          value={editData.institution || ''}
                          onChange={(e) => handleInputChange('institution', e.target.value)}
                          className="text-sm text-center"
                          placeholder="Institution"
                        />
                        <Select 
                          value={editData.department || ''} 
                          onValueChange={(value) => handleInputChange('department', value)}
                        >
                          <SelectTrigger className="text-sm text-center">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Computer Science">Computer Science</SelectItem>
                            <SelectItem value="Biology">Biology</SelectItem>
                            <SelectItem value="Chemistry">Chemistry</SelectItem>
                            <SelectItem value="Physics">Physics</SelectItem>
                            <SelectItem value="Mathematics">Mathematics</SelectItem>
                            <SelectItem value="Engineering">Engineering</SelectItem>
                            <SelectItem value="Medicine">Medicine</SelectItem>
                            <SelectItem value="Psychology">Psychology</SelectItem>
                            <SelectItem value="Economics">Economics</SelectItem>
                            <SelectItem value="Business">Business</SelectItem>
                            <SelectItem value="Education">Education</SelectItem>
                            <SelectItem value="Arts & Humanities">Arts & Humanities</SelectItem>
                            <SelectItem value="Social Sciences">Social Sciences</SelectItem>
                            <SelectItem value="Environmental Science">Environmental Science</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                            <SelectItem value="Not specified">Not specified</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold text-foreground">{researcher.name}</h1>
                        <p className="text-lg text-muted-foreground">{researcher.title}</p>
                        {researcher.institution && researcher.institution !== 'Not specified' && (
                          <p className="text-sm text-muted-foreground">{researcher.institution}</p>
                        )}
                        {researcher.department && researcher.department !== 'Not specified' && (
                          <p className="text-sm text-muted-foreground">{researcher.department}</p>
                        )}
                      </>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {isEditing ? (
                      <div className="flex items-center justify-center space-x-2">
                        <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editData.location || ''}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          className="text-sm text-center w-32"
                          placeholder="Location"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                        <MapPinIcon className="h-4 w-4" />
                        <span>{researcher.location}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                      <CalendarIcon className="h-4 w-4" />
                      <span>Joined {new Date(researcher.joinedDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Contact Links */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <GlobeAltIcon className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editData.website || ''}
                          onChange={(e) => handleInputChange('website', e.target.value)}
                          placeholder="Website URL"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Linkedin className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editData.linkedin || ''}
                          onChange={(e) => handleInputChange('linkedin', e.target.value)}
                          placeholder="LinkedIn URL"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Github className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editData.github || ''}
                          onChange={(e) => handleInputChange('github', e.target.value)}
                          placeholder="GitHub URL"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <AcademicCapIcon className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editData.orcid || ''}
                          onChange={(e) => handleInputChange('orcid', e.target.value)}
                          placeholder="ORCID ID"
                          className="text-sm"
                        />
                      </div>
                      {/* ORCID Import Component */}
                      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                        <ORCIDImport 
                          profileId={researcherId}
                          currentORCID={editData.orcid || ''}
                          onImportComplete={fetchResearcher}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center space-x-2">
                      {researcher.email && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`mailto:${researcher.email}`}>
                            <EnvelopeIcon className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {researcher.website && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={researcher.website} target="_blank" rel="noopener noreferrer">
                            <GlobeAltIcon className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {researcher.linkedin && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={researcher.linkedin} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {researcher.github && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={researcher.github} target="_blank" rel="noopener noreferrer">
                            <Github className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Edit Profile Button - Only show for own profile */}
                  {isOwnProfile && (
                    <div className="pt-4 border-t">
                      {!isEditing ? (
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="w-full"
                          onClick={handleEditToggle}
                        >
                          <PencilIcon className="h-4 w-4 mr-2" />
                          Edit Profile
                        </Button>
                      ) : (
                        <div className="flex space-x-2">
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="flex-1"
                            onClick={handleSave}
                            disabled={saving}
                          >
                            <CheckIcon className="h-4 w-4 mr-2" />
                            {saving ? 'Saving...' : 'Save'}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={handleEditToggle}
                            disabled={saving}
                          >
                            <XMarkIcon className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Delete Profile Button - Only show for own profile */}
                  {isOwnProfile && !isEditing && (
                    <div className="pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-gray-600 hover:bg-gray-100"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        Delete Profile
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UserGroupIcon className="h-5 w-5" />
                  <span>About</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <Textarea
                    value={editData.bio || ''}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself, your research interests, and background..."
                    className="min-h-[100px] text-sm"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {researcher.bio}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AcademicCapIcon className="h-5 w-5" />
                  <span>Skills</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(editData.skills || []).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs flex items-center gap-1">
                          {skill}
                          <button
                            onClick={() => removeArrayItem('skills', index)}
                            className="ml-1 hover:text-destructive"
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a skill..."
                        className="text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addArrayItem('skills', e.currentTarget.value)
                            e.currentTarget.value = ''
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement
                          if (input) {
                            addArrayItem('skills', input.value)
                            input.value = ''
                          }
                        }}
                      >
                        <PlusIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {researcher.skills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Interests */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BeakerIcon className="h-5 w-5" />
                  <span>Research Interests</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(editData.interests || []).map((interest, index) => (
                        <Badge key={index} variant="outline" className="text-xs flex items-center gap-1">
                          {interest}
                          <button
                            onClick={() => removeArrayItem('interests', index)}
                            className="ml-1 hover:text-destructive"
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a research interest..."
                        className="text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addArrayItem('interests', e.currentTarget.value)
                            e.currentTarget.value = ''
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement
                          if (input) {
                            addArrayItem('interests', input.value)
                            input.value = ''
                          }
                        }}
                      >
                        <PlusIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {researcher.interests.map((interest, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total Projects:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.totalProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Active Projects:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.activeProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Publications:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.publications}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Collaborations:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.collaborations}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Projects and Publications */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="projects" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="publications">Publications</TabsTrigger>
              </TabsList>

              <TabsContent value="projects" className="space-y-6">
                {/* Current Projects */}
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Current Projects</h2>
                  <div className="space-y-4">
                    {researcher.currentProjects.map((project) => (
                      <Card key={project.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-foreground mb-1">{project.name}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <UserGroupIcon className="h-3 w-3" />
                                  <span>{project.role}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <FolderIcon className="h-3 w-3" />
                                  <span>{project.project.name}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <CalendarIcon className="h-3 w-3" />
                                  <span>Started {new Date(project.startDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status}
                            </Badge>
                          </div>
                          <Link href={`/project/${project.project.id}`}>
                            <Button variant="outline" size="sm">
                              View Project
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Past Projects */}
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Past Projects</h2>
                  <div className="space-y-4">
                    {researcher.pastProjects.map((project) => (
                      <Card key={project.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-foreground mb-1">{project.name}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <UserGroupIcon className="h-3 w-3" />
                                  <span>{project.role}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <FolderIcon className="h-3 w-3" />
                                  <span>{project.project.name}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <CalendarIcon className="h-3 w-3" />
                                  <span>{new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status}
                            </Badge>
                          </div>
                          <Link href={`/project/${project.project.id}`}>
                            <Button variant="outline" size="sm">
                              View Project
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="publications" className="space-y-4">
                {/* ORCID Import for profile owners */}
                {isOwnProfile && (
                  <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                    <h3 className="text-lg font-semibold mb-2">Import Publications</h3>
                    <ORCIDImport 
                      profileId={researcherId}
                      currentORCID={researcher.orcid || ''}
                      onImportComplete={fetchResearcher}
                    />
                  </div>
                )}

                {/* Publication Management Tools for profile owners */}
                {isOwnProfile && researcher.publications.length > 0 && (
                  <>
                    <PublicationSearch 
                      publications={researcher.publications} 
                      onFilteredResults={handleSearch} 
                    />
                    <BulkActionsToolbar 
                      selectedCount={selectedIds.size}
                      totalCount={filteredPublications.length}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={() => setSelectedIds(new Set())}
                      onDeleteSelected={handleBulkDelete}
                    />
                    <div className="flex justify-between items-center">
                      <Button 
                        onClick={() => setShowPublicationForm(true)}
                        className="mb-4"
                      >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Publication
                      </Button>
                    </div>
                  </>
                )}
                
                {/* Publication Form Modal */}
                {showPublicationForm && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                      <PublicationForm
                        publication={editingPublication}
                        profileId={researcherId}
                        onSave={handleSavePublication}
                        onCancel={() => { 
                          setShowPublicationForm(false); 
                          setEditingPublication(null); 
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Publications List */}
                {filteredPublications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DocumentTextIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>
                      {researcher.publications.length === 0 
                        ? "No publications found" 
                        : "No publications match your search"
                      }
                    </p>
                    {isOwnProfile && researcher.publications.length === 0 && (
                      <p className="text-sm mt-2">Add your ORCID ID above to import your publications</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPublications.map((publication) => (
                      <PublicationListItem
                        key={publication.id}
                        publication={publication}
                        isSelected={selectedIds.has(publication.id)}
                        showCheckbox={isOwnProfile}
                        onSelect={handleSelectPublication}
                        onEdit={(pub) => { 
                          setEditingPublication(pub); 
                          setShowPublicationForm(true); 
                        }}
                        onDelete={handleDeletePublication}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      {/* Delete Profile Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="text-red-600">⚠️ Delete Profile</CardTitle>
              <CardDescription>
                This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm space-y-2">
                <p className="font-semibold">This will permanently delete:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Your profile information</li>
                  <li>All projects where you are the only member ({deleteStats?.soloProjects || 0} projects)</li>
                  <li>All your publications ({researcher?.publications?.length || 0} publications)</li>
                  <li>All your experiment trees and data from solo projects</li>
                </ul>
                <p className="text-sm pt-2">
                  You will be removed from collaborative projects but they will remain active.
                </p>
                <p className="text-sm text-muted-foreground italic pt-2">
                  Note: Data export feature will be available soon.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="deleteConfirmation">
                  Type <span className="font-bold">DELETE</span> to confirm:
                </Label>
                <Input
                  id="deleteConfirmation"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  className="font-mono"
                />
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={handleDeleteProfile}
                  disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Profile'}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowDeleteDialog(false)
                    setDeleteConfirmation('')
                  }}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Success Message */}
      {showDeleteSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <CheckIcon className="h-16 w-16 mx-auto text-green-500" />
              <h2 className="text-2xl font-bold">Account Deleted</h2>
              <p className="text-muted-foreground">
                Your profile has been permanently deleted. Redirecting to home page...
              </p>
              <p className="text-sm text-muted-foreground pt-2 border-t">
                Note: You can sign up again with the same email address after 1-2 minutes.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
