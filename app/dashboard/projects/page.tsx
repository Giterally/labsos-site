"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  BeakerIcon,
  FolderIcon,
  DocumentTextIcon,
  LinkIcon,
  TagIcon,
  CalendarIcon,
  UserGroupIcon,
  PlusIcon,
  BellIcon,
  Cog6ToothIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import CreateProjectForm from "@/components/forms/CreateProjectForm"
import ManageTeamForm from "@/components/forms/ManageTeamForm"


export default function ProjectsPage() {
  const [user, setUser] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const router = useRouter()

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true)
      
      // Get current user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) {
        console.error('Error getting user:', authError)
        setProjects([])
        return
      }

      // Get session for API call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error('Error getting session:', sessionError)
        setProjects([])
        return
      }

      // Fetch user's projects using the API
      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      console.log('DEBUG: API response status:', response.status, response.ok)
      
      let apiProjects = []
      if (!response.ok) {
        const errorData = await response.json()
        console.error('API Error:', errorData)
        
        // Fallback: try direct Supabase query
        const { data: fallbackProjects, error: fallbackError } = await supabase
          .from('projects')
          .select('*')
          .eq('created_by', authUser.id)
          .order('created_at', { ascending: false })

        if (fallbackError) {
          console.error('Fallback query error:', fallbackError)
          throw new Error('Failed to fetch projects')
        }

        apiProjects = fallbackProjects || []
      } else {
        const { projects } = await response.json()
        apiProjects = projects || []
        console.log('DEBUG: API returned projects:', apiProjects.length, 'projects')
        console.log('DEBUG: Project names from API:', apiProjects.map(p => p.name))
      }

      // Transform the data to match the expected format
      const transformedProjects = (apiProjects || []).map((project: any) => {
        return {
          id: project.slug || project.id, // Use slug if available, fallback to UUID
          name: project.name,
          description: project.description || 'No description available',
          status: project.status || "Active",
          color: (project.is_owner || project.created_by === authUser.id) ? "bg-blue-500" : "bg-green-500", // Blue for owned, green for member
          collaborators: [], // Will be populated later if needed
          repository: null, // Default repository
          createdDate: new Date(project.created_at).toISOString().split('T')[0], // Format date
          isOwner: project.is_owner || project.created_by === authUser.id,
          userRole: 'Admin',
          visibility: project.visibility || 'private'
        }
      })
      setProjects(transformedProjects)
    } catch (err) {
      console.error('Error in fetchProjects:', err)
      // Set a default empty state with error info
      setProjects([])
      // You could also set an error state here if needed
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        router.push("/login")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email, institution, department')
        .eq('id', authUser.id)
        .single()

      if (profileError) {
        console.error("Error fetching profile:", profileError)
        // Use basic user info if profile fails
        setUser({
          full_name: authUser.user_metadata?.full_name || authUser.email || 'User',
          email: authUser.email || '',
          institution: authUser.user_metadata?.institution || 'N/A',
          department: authUser.user_metadata?.department || 'N/A',
        })
      } else {
        setUser(profile)
      }
    }

    fetchUser()
    fetchProjects() // Fetch projects when component mounts

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }


  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 pt-20">
        {!selectedProject ? (
          <>
            {/* Projects Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Projects</h1>
                <p className="text-muted-foreground">Manage your research projects and collaborations</p>
              </div>
              <CreateProjectForm onProjectCreated={fetchProjects} />
            </div>

            {/* Project Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectsLoading ? (
                // Loading state
                Array.from({ length: 3 }).map((_, index) => (
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
              ) : projects.length === 0 ? (
                // Empty state
                <div className="col-span-full text-center py-12">
                  <FolderIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">No projects yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first project to get started</p>
                  <CreateProjectForm onProjectCreated={fetchProjects} />
                </div>
              ) : (
                projects.map((project) => (
                <Card
                  key={project.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/project/${project.id}`)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-4 h-4 rounded-full ${project.color} mt-1`}></div>
                    </div>
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{project.status}</Badge>
                        <Badge variant={project.visibility === 'public' ? 'default' : 'secondary'}>
                          {project.visibility === 'public' ? 'Public' : 'Private'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      {project.isOwner && (
                        <ManageTeamForm 
                          projectId={project.id} 
                          onTeamUpdated={fetchProjects}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {project.collaborators.map((collab, index) => (
                          <Avatar key={index} className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-xs">{collab}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ))
              )}
            </div>
          </>
        ) : (
          /* Project Detail View */
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)}>
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
              <div className={`w-4 h-4 rounded-full ${selectedProject.color}`}></div>
              <h1 className="text-3xl font-bold text-foreground">{selectedProject.name}</h1>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {/* Project Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground">{selectedProject.description}</p>


                    {selectedProject.repository && (
                      <div className="flex items-center gap-2 text-sm">
                        <LinkIcon className="h-4 w-4" />
                        <a href={`https://${selectedProject.repository}`} className="text-primary hover:underline">
                          {selectedProject.repository}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">JS</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">John Smith</span> updated quality control script
                          <div className="text-muted-foreground">2 hours ago</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">MJ</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">Maria Johnson</span> added documentation for alignment step
                          <div className="text-muted-foreground">1 day ago</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">AK</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">Alex Kim</span> linked new dataset
                          <div className="text-muted-foreground">3 days ago</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Files & Documentation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DocumentTextIcon className="h-5 w-5" />
                      Files & Documentation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { name: "README.md", type: "Documentation", size: "2.4 KB", updated: "2 hours ago" },
                      { name: "quality_control.py", type: "Script", size: "15.2 KB", updated: "2 hours ago" },
                      { name: "alignment.sh", type: "Script", size: "3.1 KB", updated: "1 day ago" },
                      { name: "sample_metadata.csv", type: "Dataset", size: "45.7 KB", updated: "3 days ago" },
                      { name: "analysis_protocol.md", type: "Documentation", size: "8.9 KB", updated: "1 week ago" },
                    ].map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <DocumentTextIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{file.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {file.size} • Updated {file.updated}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {file.type}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Project Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Created:</span>
                        <span>{selectedProject.createdDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <FolderIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant="outline">{selectedProject.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Collaborators */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserGroupIcon className="h-5 w-5" />
                      Collaborators
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { initials: "JS", name: "John Smith", role: "Lead Developer" },
                      { initials: "MJ", name: "Maria Johnson", role: "Bioinformatician" },
                      { initials: "AK", name: "Alex Kim", role: "Data Analyst" },
                    ].map((collab, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{collab.initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">{collab.name}</div>
                          <div className="text-xs text-muted-foreground">{collab.role}</div>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full mt-3 bg-transparent">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Collaborator
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

