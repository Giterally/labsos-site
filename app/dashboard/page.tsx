"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BeakerIcon } from "@heroicons/react/24/outline"

interface UserProfile {
  full_name: string
  email: string
  institution: string
  field_of_study: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        router.push("/login")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('full_name, email, institution, field_of_study')
        .eq('user_id', authUser.id)
        .single()

      if (profileError) {
        console.error("Error fetching profile:", profileError)
        setError("Failed to load user profile.")
        // Even if profile fails, we can still show basic user info
        setUser({
          full_name: authUser.user_metadata?.full_name || authUser.email || 'User',
          email: authUser.email || '',
          institution: authUser.user_metadata?.institution || 'N/A',
          field_of_study: authUser.user_metadata?.field_of_study || 'N/A',
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4 pt-20">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <BeakerIcon className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Knowledge Capture</span>
          </div>
          <CardTitle className="text-3xl">Welcome to your Dashboard, {user?.full_name || 'User'}!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
            <div>
              <p className="font-semibold text-muted-foreground">Email:</p>
              <p className="text-foreground">{user?.email}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground">Institution:</p>
              <p className="text-foreground">{user?.institution}</p>
            </div>
            <div className="md:col-span-2">
              <p className="font-semibold text-muted-foreground">Primary Field of Study:</p>
              <p className="text-foreground">{user?.field_of_study}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => router.push("/dashboard/projects")} className="w-full max-w-xs">
              View My Projects
            </Button>
            <Button onClick={() => router.push("/profile")} variant="outline" className="w-full max-w-xs">
              View My Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}