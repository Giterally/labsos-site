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

export default function PublicProjectsPage() {
  const [projects, setProjects] = useState<PublicProject[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredProjects, setFilteredProjects] = useState<PublicProject[]>([])

  useEffect(() => {
    fetchPublicProjects()
  }, [])

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

  const fetchPublicProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects/public')
      
      if (!response.ok) {
        throw new Error('Failed to fetch public projects')
      }

      const data = await response.json()
      setProjects(data.projects || [])
    } catch (error) {
      console.error('Error fetching public projects:', error)
      setProjects([])
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
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BeakerIcon className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Knowledge Capture</span>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
            Sign In
            </Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 pt-20">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-foreground">Discover Research Projects</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore public research projects and see how researchers are organizing their work with Knowledge Capture
          </p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-8">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
              placeholder="Search projects, universities, or research areas..." 
                    className="pl-12 h-12 text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                  </div>

        {/* Projects Grid */}
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
          ) : filteredProjects.length === 0 ? (
            // Empty state
            <div className="col-span-full text-center py-12">
              <BeakerIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                {searchTerm ? 'No projects found' : 'No public projects yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Be the first to make your research project public!'
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
                className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => window.open(`/project/${project.id}`, '_blank')}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className={`w-4 h-4 rounded-full ${getStatusColor(project.status)} mt-1`}></div>
                    <Badge variant="outline" className="text-xs">
                      {getStatusText(project.status)}
                    </Badge>
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