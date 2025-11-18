"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Folder, CheckCircle2, FileText, Clock } from "lucide-react"
import { format } from "date-fns"
// Removed legacy beaker icon and 'Knowledge Capture' branding per request

interface UserProfile {
  full_name: string
  email: string
  institution: string
  department: string
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  visibility: string
  updated_at: string
  created_at: string
}

interface RecentActivity {
  id: string
  type: 'task' | 'work_log'
  title: string
  description?: string
  updated_at: string
  status?: string
  project?: {
    id: string
    name: string
  }
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>('tasks')

  // Read tab from URL on mount
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'logs' || tab === 'tasks') {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`/dashboard?${params.toString()}`, { scroll: false })
  }

  // Fetch recent projects
  useEffect(() => {
    const fetchRecentProjects = async () => {
      try {
        setLoadingProjects(true)
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const response = await fetch('/api/projects', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (response.ok) {
          const { projects } = await response.json()
          // Sort by updated_at descending and take first 2
          const sorted = (projects || [])
            .sort((a: Project, b: Project) => 
              new Date(b.updated_at || b.created_at).getTime() - 
              new Date(a.updated_at || a.created_at).getTime()
            )
            .slice(0, 2)
          setRecentProjects(sorted)
        }
      } catch (err) {
        console.error('Error fetching recent projects:', err)
      } finally {
        setLoadingProjects(false)
      }
    }

    if (user) {
      fetchRecentProjects()
    }
  }, [user])

  // Fetch recent activities (tasks and work logs)
  useEffect(() => {
    const fetchRecentActivities = async () => {
      try {
        setLoadingActivities(true)
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Fetch both todos and work logs
        const [todosResponse, workLogsResponse] = await Promise.all([
          fetch('/api/todos?listType=personal&status=all', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }),
          fetch('/api/work-logs?userId=' + authUser.id, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }),
        ])

        const activities: RecentActivity[] = []

        if (todosResponse.ok) {
          const { todos } = await todosResponse.json()
          todos?.forEach((todo: any) => {
            activities.push({
              id: todo.id,
              type: 'task',
              title: todo.title,
              description: todo.description,
              updated_at: todo.updated_at || todo.created_at,
              status: todo.status,
              project: todo.project_assignments?.[0]?.project,
            })
          })
        }

        if (workLogsResponse.ok) {
          const { workLogs } = await workLogsResponse.json()
          workLogs?.forEach((log: any) => {
            activities.push({
              id: log.id,
              type: 'work_log',
              title: log.title,
              description: log.content,
              updated_at: log.updated_at || log.created_at,
              project: log.project,
            })
          })
        }

        // Sort by updated_at descending and take first 2
        const sorted = activities
          .sort((a, b) => 
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
          .slice(0, 2)

        setRecentActivities(sorted)
      } catch (err) {
        console.error('Error fetching recent activities:', err)
      } finally {
        setLoadingActivities(false)
      }
    }

    if (user) {
      fetchRecentActivities()
    }
  }, [user])

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
        setError("Failed to load user profile.")
        // Even if profile fails, we can still show basic user info
        setUser({
          full_name: authUser.user_metadata?.full_name || authUser.email || 'User',
          email: authUser.email || '',
          institution: authUser.user_metadata?.institution || 'N/A',
          department: authUser.user_metadata?.department || 'N/A',
        })
      } else {
        setUser(profile)
      }
      setLoading(false)
    }

    fetchUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={() => router.push("/login")} className="mt-4">Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Content */}
      <div className="container mx-auto px-6 py-8 space-y-12">
        {/* Hero action */}
        <section className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">Welcome, {user?.full_name || 'User'}</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
            Projects organize your research with experiment trees that capture protocols, data, and results.
            Track tasks and work logs to keep everything on track.
          </p>
          <div className="mt-6 flex justify-center gap-4 flex-wrap">
            <Button
              size="lg"
              className="px-8 py-6 text-lg shadow-md"
              onClick={() => router.push('/dashboard/projects')}
            >
              View My Projects
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg shadow-md hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => router.push('/dashboard/tasks')}
            >
              Tasks & Work Logs
            </Button>
          </div>
        </section>
        {/* Profile summary (compact) */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-0">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Email</div>
                <div className="text-sm truncate">{(user as any)?.email || '—'}</div>
              </CardContent>
            </Card>
            <Card className="p-0">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Institution</div>
                <div className="text-sm truncate">{user?.institution || '—'}</div>
              </CardContent>
            </Card>
            <Card className="p-0">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Department</div>
                <div className="text-sm truncate">{user?.department || '—'}</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Split Layout: Projects and Tasks/Work Logs */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Recent Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Recent Projects</h2>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => router.push('/dashboard/projects')}
                  className="gap-2"
                >
                  View All
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {loadingProjects ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      Loading projects...
                    </CardContent>
                  </Card>
                ) : recentProjects.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No projects yet</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => router.push('/dashboard/projects')}
                      >
                        Create Your First Project
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  recentProjects.map((project) => (
                    <Card 
                      key={project.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => router.push(`/project/${project.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <h3 className="font-semibold truncate">{project.name}</h3>
                            </div>
                            {project.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {project.status}
                              </Badge>
                              <Badge 
                                variant={project.visibility === 'public' ? 'default' : project.visibility === 'stealth' ? 'outline' : 'secondary'}
                                className="text-xs"
                              >
                                {project.visibility === 'public' ? 'Public' : project.visibility === 'stealth' ? 'Stealth' : 'Private'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(project.updated_at || project.created_at), 'MMM d, yyyy')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Right: Recent Tasks & Work Logs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Recent Activity</h2>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => router.push('/dashboard/tasks')}
                  className="gap-2"
                >
                  View All
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {loadingActivities ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      Loading activities...
                    </CardContent>
                  </Card>
                ) : recentActivities.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent tasks or work logs</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => router.push('/dashboard/tasks')}
                      >
                        Create Your First Task
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  recentActivities.map((activity) => (
                    <Card 
                      key={`${activity.type}-${activity.id}`}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => router.push('/dashboard/tasks')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {activity.type === 'task' ? (
                            <CheckCircle2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <FileText className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="font-semibold truncate">{activity.title}</h3>
                              {activity.type === 'task' && activity.status && (
                                <Badge 
                                  variant={activity.status === 'completed' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {activity.status}
                                </Badge>
                              )}
                            </div>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {activity.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {activity.project && (
                                <>
                                  <Folder className="h-3 w-3" />
                                  <span className="truncate">{activity.project.name}</span>
                                </>
                              )}
                              <Clock className="h-3 w-3 ml-auto" />
                              <span>{format(new Date(activity.updated_at), 'MMM d, yyyy')}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Messaging section removed per request */}
      </div>
    </div>
  )
}