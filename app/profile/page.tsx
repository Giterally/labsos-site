"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  UserIcon, 
  EnvelopeIcon, 
  BuildingOfficeIcon, 
  AcademicCapIcon,
  CalendarIcon,
  PencilIcon,
  ArrowLeftIcon,
  CameraIcon,
  TrashIcon
} from "@heroicons/react/24/outline"

interface UserProfile {
  full_name: string
  email: string
  institution: string
  field_of_study: string
  created_at: string
  updated_at: string
  profile_picture_url?: string
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
          router.push("/login")
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('full_name, email, institution, field_of_study, created_at, updated_at, profile_picture_url')
          .eq('user_id', authUser.id)
          .single()

        if (profileError) {
          console.error("Error fetching profile:", profileError)
          setError("Failed to load user profile.")
          // Fallback to basic user info if profile fails
          setUser({
            full_name: authUser.user_metadata?.full_name || authUser.email || 'User',
            email: authUser.email || '',
            institution: authUser.user_metadata?.institution || 'Not specified',
            field_of_study: authUser.user_metadata?.field_of_study || 'Not specified',
            created_at: authUser.created_at || new Date().toISOString(),
            updated_at: authUser.updated_at || new Date().toISOString(),
          })
        } else {
          setUser(profile)
        }
      } catch (err: any) {
        console.error("Error fetching user profile:", err)
        setError("An error occurred while loading your profile.")
      } finally {
        setLoading(false)
      }
    }

    fetchUserProfile()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const handleEditProfile = () => {
    // For now, just show an alert. You can implement an edit profile form later
    alert("Edit profile functionality coming soon!")
  }

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    try {
      setUploading(true)
      
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) {
        throw new Error('Not authenticated')
      }

      // Create a unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${authUser.id}-${Date.now()}.${fileExt}`
      const filePath = `profile-pictures/${fileName}`

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update user profile with new picture URL
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ profile_picture_url: publicUrl })
        .eq('user_id', authUser.id)

      if (updateError) {
        throw updateError
      }

      // Update local state
      setUser(prev => prev ? { ...prev, profile_picture_url: publicUrl } : null)
      
      alert('Profile picture updated successfully!')
    } catch (err: any) {
      console.error('Error uploading profile picture:', err)
      alert('Failed to upload profile picture: ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteProfilePicture = async () => {
    if (!user?.profile_picture_url) {
      alert('No profile picture to delete')
      return
    }

    if (!confirm('Are you sure you want to delete your profile picture?')) {
      return
    }

    try {
      setDeleting(true)
      
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) {
        throw new Error('Not authenticated')
      }

      // Extract the file path from the URL
      const url = new URL(user.profile_picture_url)
      const pathParts = url.pathname.split('/')
      const bucketName = pathParts[pathParts.length - 2] // Should be 'avatars'
      const fileName = pathParts[pathParts.length - 1] // The actual file name
      const filePath = `profile-pictures/${fileName}`

      // Delete file from Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([filePath])

      if (deleteError) {
        console.warn('Error deleting file from storage:', deleteError)
        // Continue with database update even if file deletion fails
      }

      // Update user profile to remove picture URL
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ profile_picture_url: null })
        .eq('user_id', authUser.id)

      if (updateError) {
        throw updateError
      }

      // Update local state
      setUser(prev => prev ? { ...prev, profile_picture_url: undefined } : null)
      
      alert('Profile picture deleted successfully!')
    } catch (err: any) {
      console.error('Error deleting profile picture:', err)
      alert('Failed to delete profile picture: ' + (err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={() => router.push("/dashboard")} className="mt-4">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Profile Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Your profile could not be found.</p>
            <Button onClick={() => router.push("/dashboard")} className="mt-4">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 pt-20">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
                <p className="text-muted-foreground">Manage your personal information and account settings</p>
              </div>
            </div>
            <Button onClick={handleEditProfile} className="flex items-center space-x-2">
              <PencilIcon className="h-4 w-4" />
              <span>Edit Profile</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Profile Overview */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="text-center">
                  <div className="flex justify-center mb-4">
                    <Avatar className="h-24 w-24">
                      {user.profile_picture_url ? (
                        <img 
                          src={user.profile_picture_url} 
                          alt="Profile" 
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AvatarFallback className="text-2xl">
                          {user.full_name
                            ? user.full_name
                                .split(" ")
                                .map((n: string) => n[0])
                                .join("")
                            : "U"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </div>
                  <div className="mb-4 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePictureUpload}
                      className="hidden"
                      id="profile-picture-upload"
                      disabled={uploading || deleting}
                    />
                    <div className="flex gap-2 justify-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label
                              htmlFor="profile-picture-upload"
                              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg cursor-pointer hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploading ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              ) : (
                                <CameraIcon className="h-4 w-4" />
                              )}
                              <span className="text-sm font-medium">
                                {uploading ? "Uploading..." : user?.profile_picture_url ? "Change Photo" : "Upload Photo"}
                              </span>
                            </label>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Upload or change your profile picture</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {user?.profile_picture_url && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={handleDeleteProfilePicture}
                                disabled={uploading || deleting}
                                className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg cursor-pointer hover:bg-destructive/90 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deleting ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                  <TrashIcon className="h-4 w-4" />
                                )}
                                <span className="text-sm font-medium">
                                  {deleting ? "Deleting..." : "Delete"}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete your profile picture</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <CardTitle className="text-xl">{user.full_name}</CardTitle>
                  <p className="text-muted-foreground">{user.email}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <BuildingOfficeIcon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Institution</p>
                        <p className="text-sm text-muted-foreground">{user.institution}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <AcademicCapIcon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Field of Study</p>
                        <p className="text-sm text-muted-foreground">{user.field_of_study}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Detailed Information */}
            <div className="lg:col-span-2 space-y-6">
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <UserIcon className="h-5 w-5" />
                    <span>Personal Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                      <p className="text-sm">{user.full_name}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                      <p className="text-sm">{user.email}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">University/Institution</label>
                      <p className="text-sm">{user.institution}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Primary Field of Study</label>
                      <Badge variant="outline" className="text-sm">
                        {user.field_of_study}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Account Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CalendarIcon className="h-5 w-5" />
                    <span>Account Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                      <p className="text-sm">
                        {new Date(user.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                      <p className="text-sm">
                        {new Date(user.updated_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Research Profile */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <AcademicCapIcon className="h-5 w-5" />
                    <span>Research Profile</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Research Focus</p>
                        <p className="text-sm text-muted-foreground">{user.field_of_study}</p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Institution</p>
                        <p className="text-sm text-muted-foreground">{user.institution}</p>
                      </div>
                      <Badge variant="outline">Verified</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
