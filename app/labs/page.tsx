"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  FolderIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth-service"

interface PublicProject {
  id: string
  name: string
  description: string
  institution: string
  department: string
  status: string
  visibility: string
  created_at: string
  lead_researcher: string
  lab_name: string
  member_count: number
  tree_count: number
  avatar: string
}

interface PublicResearcher {
  id: string
  full_name: string
  email: string
  lab_name: string
  institution: string
  department: string
  bio: string
  skills: string[]
  interests: string[]
  orcid_id: string | null
  website: string | null
  linkedin: string | null
  created_at: string
  project_count: number
  public_project_count: number
  avatar: string
}

export default function PublicProjectsPage() {
  const [projects, setProjects] = useState<PublicProject[]>([])
  const [researchers, setResearchers] = useState<PublicResearcher[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredProjects, setFilteredProjects] = useState<PublicProject[]>([])
  const [filteredResearchers, setFilteredResearchers] = useState<PublicResearcher[]>([])
  const [activeTab, setActiveTab] = useState<'projects' | 'researchers'>('projects')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetchPublicProjects()
    fetchPublicResearchers()
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const user = await getCurrentUser()
      setIsAuthenticated(!!user)
    } catch (error) {
      console.error('Auth check error:', error)
      setIsAuthenticated(false)
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    // Filter projects based on search term
    if (!searchTerm.trim()) {
      setFilteredProjects(projects)
    } else {
      const filtered = projects.filter(project =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.institution.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.lead_researcher.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.lab_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredProjects(filtered)
    }
  }, [searchTerm, projects])

  useEffect(() => {
    // Filter researchers based on search term
    if (!searchTerm.trim()) {
      setFilteredResearchers(researchers)
    } else {
      const filtered = researchers.filter(researcher =>
        researcher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        researcher.lab_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        researcher.institution.toLowerCase().includes(searchTerm.toLowerCase()) ||
        researcher.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        researcher.bio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        researcher.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        researcher.interests.some(interest => interest.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      setFilteredResearchers(filtered)
    }
  }, [searchTerm, researchers])

  const fetchPublicProjects = async () => {
    try {
      const response = await fetch('/api/projects/public')
      
      if (!response.ok) {
        throw new Error('Failed to fetch public projects')
      }

      const data = await response.json()
      setProjects(data.projects || [])
    } catch (error) {
      console.error('Error fetching public projects:', error)
      setProjects([])
    }
  }

  const fetchPublicResearchers = async () => {
    try {
      const response = await fetch('/api/researchers/public')
      
      if (!response.ok) {
        throw new Error('Failed to fetch researchers')
      }

      const data = await response.json()
      setResearchers(data.researchers || [])
    } catch (error) {
      console.error('Error fetching researchers:', error)
      setResearchers([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'completed': return 'bg-blue-500'
      case 'draft': return 'bg-yellow-500'
      case 'archived': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active'
      case 'completed': return 'Completed'
      case 'draft': return 'Draft'
      case 'archived': return 'Archived'
      default: return status
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Only show when not authenticated */}
      {!authLoading && !isAuthenticated && (
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 16C11.5 16 11 18 11 20V22H13V20C13 18 12.5 16 12.5 16" fill="#1B5E20" stroke="#1B5E20" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C8 6 6 10 6 14C6 16 8 16 10 14C10 12 11 10 12 8C13 10 14 12 14 14C16 16 18 16 18 14C18 10 16 6 12 2Z" fill="#1B5E20" stroke="#1B5E20" />
                <path strokeLinecap="round" strokeWidth={1.5} d="M10 22C9 21 8 20 7 19" fill="#1B5E20" stroke="#1B5E20" />
                <path strokeLinecap="round" strokeWidth={1.5} d="M14 22C15 21 16 20 17 19" fill="#1B5E20" stroke="#1B5E20" />
              </svg>
              <span className="text-2xl font-bold text-foreground">Olvaro</span>
            </Link>
            <Link href="/login">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold px-8 py-3 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </header>
      )}

      <div className={`container mx-auto px-4 py-8 ${!authLoading && !isAuthenticated ? 'pt-20' : 'pt-8'}`}>
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-foreground">Discover Research</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore research projects and connect with researchers using Olvaro
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'projects'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setActiveTab('researchers')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'researchers'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Researchers
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-8">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
              placeholder={activeTab === 'projects' ? "Search projects, universities, or research areas..." : "Search researchers, institutions, or expertise..."} 
                    className="pl-12 h-12 text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                  </div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            // Loading state
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="w-4 h-4 rounded-full bg-gray-300 mt-1"></div>
                    <div className="w-6 h-6 bg-gray-300 rounded"></div>
                  </div>
                  <div className="h-6 bg-gray-300 rounded mb-2"></div>
                  <div className="h-4 bg-gray-300 rounded"></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-4 bg-gray-300 rounded"></div>
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))
          ) : activeTab === 'projects' ? (
            // Projects content
            filteredProjects.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <BeakerIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  {searchTerm ? 'No projects found' : 'No projects yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm 
                    ? 'Try adjusting your search terms' 
                    : 'Be the first to create a research project!'
                  }
                </p>
                {!searchTerm && (
                  <Link href="/login">
                    <Button>
                      Sign In to Create Project
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className={`hover:shadow-lg transition-shadow group ${
                    project.visibility === 'public' ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                  }`}
                  onClick={() => {
                    if (project.visibility === 'public') {
                      window.open(`/project/${project.id}`, '_blank')
                    }
                  }}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-4 h-4 rounded-full ${getStatusColor(project.status)} mt-1`}></div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getStatusText(project.status)}
                        </Badge>
                        {project.visibility === 'private' && (
                          <Badge variant="secondary" className="text-xs">
                            Private
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-xs">
                          {project.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{project.lab_name}</div>
                        <div className="text-xs text-muted-foreground">{project.institution}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <UserGroupIcon className="h-4 w-4" />
                        <span>{project.member_count} members</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <FolderIcon className="h-4 w-4" />
                        <span>{project.tree_count} trees</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Created {new Date(project.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              ))
            )
          ) : (
            // Researchers content
            filteredResearchers.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <UserGroupIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  {searchTerm ? 'No researchers found' : 'No researchers yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm 
                    ? 'Try adjusting your search terms' 
                    : 'Be the first to join as a researcher!'
                  }
                </p>
                {!searchTerm && (
                  <Link href="/login">
                    <Button>
                      Sign In to Join
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              filteredResearchers.map((researcher) => (
                <Card
                  key={researcher.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => window.open(`/researcher/${researcher.id}`, '_blank')}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                          {researcher.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <Badge variant="outline" className="text-xs">
                        {researcher.public_project_count} public projects
                      </Badge>
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {researcher.full_name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {researcher.bio}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="font-medium text-sm">{researcher.lab_name}</div>
                      <div className="text-xs text-muted-foreground">{researcher.institution}</div>
                      {researcher.department && (
                        <div className="text-xs text-muted-foreground">{researcher.department}</div>
                      )}
                    </div>

                    {researcher.skills.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Skills</div>
                        <div className="flex flex-wrap gap-1">
                          {researcher.skills.slice(0, 3).map((skill, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {researcher.skills.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{researcher.skills.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <FolderIcon className="h-4 w-4" />
                        <span>{researcher.project_count} total projects</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Joined {new Date(researcher.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              ))
            )
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link href="/">
            <Button variant="outline">
              ← Back to Home
              </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}