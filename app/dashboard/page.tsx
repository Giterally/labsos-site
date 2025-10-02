"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  BeakerIcon,
  PlusIcon,
  FolderIcon,
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  ArrowRightOnRectangleIcon,
  CodeBracketIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCurrentUser, signOut, onAuthStateChange, User } from "@/lib/auth-service"
import { supabase } from "@/lib/supabase-client"
import CreateProjectForm from "@/components/forms/CreateProjectForm"

interface Project {
  id: string
  name: string
  description: string | null
  institution: string | null
  department: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  created_by: string | null
  created_at: string
  updated_at: string
  members?: any[]
  past_members?: any[]
  related_projects?: any[]
  experiment_trees?: any[]
  software?: any[]
  datasets?: any[]
  outputs?: any[]
  stats?: {
    total_trees: number
    active_trees: number
    completed_trees: number
    total_nodes: number
    total_software: number
    total_datasets: number
    total_outputs: number
    total_publications: number
    total_citations: number
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = onAuthStateChange((user) => {
      if (user) {
        setUser(user)
        if (!hasFetched) {
          fetchProjects()
          setHasFetched(true)
        }
      } else {
        setUser(null)
        setHasFetched(false)
        router.push("/login")
      }
    })

    // Get initial user
    getCurrentUser().then((user) => {
      if (user) {
        setUser(user)
        if (!hasFetched) {
          fetchProjects()
          setHasFetched(true)
        }
      } else {
        router.push("/login")
      }
    }).catch(() => {
      router.push("/login")
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [router, hasFetched])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch projects')
      }

      const { projects } = await response.json()
      setProjects(projects)
    } catch (err: any) {
      console.error('Error fetching projects:', err)
      setError(err.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prevProjects) => [...prevProjects, newProject])
  }

  const handleLogout = async () => {
    try {
      await signOut()
      router.push("/")
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Dashboard...</h1>
          <p className="text-muted-foreground">Please wait while we fetch your projects.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Dashboard</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => {
            setError(null)
            setHasFetched(false)
            fetchProjects()
          }}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <BeakerIcon className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">My Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <div className="flex items-center space-x-3">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground">{user.full_name || user.email}</span>
                </div>
              )}
              <CreateProjectForm onProjectCreated={handleProjectCreated} />
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-foreground mb-6">Your Projects</h2>
        {projects.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FolderIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Projects Yet</h3>
              <p className="text-muted-foreground mb-6">
                Get started by creating your first research project.
              </p>
              <CreateProjectForm onProjectCreated={handleProjectCreated} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/project/${project.id}`)}>
                <CardHeader>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <CardDescription>{project.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="outline">{project.status}</Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Institution:</span>
                    <span>{project.institution}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Department:</span>
                    <span>{project.department}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
