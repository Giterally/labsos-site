"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import TodoList from "@/components/activity-tracker/todos/TodoList"
import WorkLogList from "@/components/activity-tracker/work-logs/WorkLogList"
// Removed legacy beaker icon and 'Knowledge Capture' branding per request

interface UserProfile {
  full_name: string
  email: string
  institution: string
  department: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      {/* Header */}
      <div className="w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl font-semibold">Welcome, {user?.full_name || 'User'}</div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => router.push('/dashboard/projects')}>View My Projects</Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8 space-y-12">
        {/* Hero action */}
        <section className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">Your research, organized</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Projects are collaborative spaces for your lab. Inside each project, experiment trees capture
            protocols, data creation, analysis, and results so work stays structured and reproducible.
          </p>
          <div className="mt-6 flex justify-center">
            <Button
              size="lg"
              className="px-8 py-6 text-lg shadow-md"
              onClick={() => router.push('/dashboard/projects')}
            >
              View My Projects
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

        {/* Activity Tracker */}
        <section>
          <div className="rounded-xl border bg-muted/40 p-4 md:p-6">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Activity Tracker</h2>
                <TabsList>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="logs">Work Logs</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="tasks" className="mt-0">
                <TodoList />
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <WorkLogList />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <Separator />

        {/* Ticketing */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Ticketing</h2>
          </div>
          <div className="rounded-xl border bg-muted/40 p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-background/60">
                <CardHeader><CardTitle className="text-base">Backlog</CardTitle></CardHeader>
                <CardContent className="py-8 text-center text-muted-foreground">Coming soon</CardContent>
              </Card>
              <Card className="bg-background/60">
                <CardHeader><CardTitle className="text-base">In Progress</CardTitle></CardHeader>
                <CardContent className="py-8 text-center text-muted-foreground">Coming soon</CardContent>
              </Card>
              <Card className="bg-background/60">
                <CardHeader><CardTitle className="text-base">Done</CardTitle></CardHeader>
                <CardContent className="py-8 text-center text-muted-foreground">Coming soon</CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Messaging section removed per request */}
      </div>
    </div>
  )
}