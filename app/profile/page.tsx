"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"

export default function ProfilePage() {
  const router = useRouter()

  useEffect(() => {
    const redirectToUserProfile = async () => {
      try {
        // Get the current user
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error || !user) {
          // If not authenticated, redirect to login
          router.push('/login')
          return
        }

        // Redirect to the user's researcher profile page
        router.push(`/researcher/${user.id}`)
      } catch (error) {
        console.error('Error redirecting to profile:', error)
        router.push('/login')
      }
    }

    redirectToUserProfile()
  }, [router])

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    </div>
  )
}