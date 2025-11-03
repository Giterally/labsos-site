'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeftIcon, ShieldIcon, PaletteIcon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase-client'

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  
  // Get initial tab from URL parameter, default to 'privacy'
  const initialTab = searchParams.get('tab') || 'privacy'
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // Privacy settings
  const [profileVisibility, setProfileVisibility] = useState('public')
  const [showEmail, setShowEmail] = useState(true)
  const [showProjects, setShowProjects] = useState(true)
  
  // Loading states
  const [loading, setLoading] = useState(true)

  // Update tab when URL parameter changes
  useEffect(() => {
    const tab = searchParams.get('tab') || 'privacy'
    setActiveTab(tab)
  }, [searchParams])

  // Load user settings from database
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setLoading(false)
          return
        }

        const response = await fetch('/api/settings/privacy', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setShowEmail(data.showEmail ?? true)
          setShowProjects(data.showProjects ?? true)
        } else {
          // Default values if fetch fails
          setShowEmail(true)
          setShowProjects(true)
        }
      } catch (error) {
        console.error('Error loading settings:', error)
        // Default values on error
        setShowEmail(true)
        setShowProjects(true)
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Save settings to database when they change
  const savePrivacySettings = async (email?: boolean, projects?: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        return
      }

      const updateData: any = {}
      if (email !== undefined) {
        updateData.showEmail = email
      }
      if (projects !== undefined) {
        updateData.showProjects = projects
      }

      await fetch('/api/settings/privacy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(updateData)
      })
    } catch (error) {
      console.error('Error saving privacy settings:', error)
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center space-x-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="privacy" className="flex items-center space-x-2">
              <ShieldIcon className="h-4 w-4" />
              <span>Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center space-x-2">
              <PaletteIcon className="h-4 w-4" />
              <span>Appearance</span>
            </TabsTrigger>
          </TabsList>

          {/* Privacy Settings */}
          <TabsContent value="privacy" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Privacy & Security</CardTitle>
                <CardDescription>
                  Control who can see your information and activities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Profile Visibility</Label>
                  <Select value={profileVisibility} onValueChange={(value) => {
                    setProfileVisibility(value)
                    toast({
                      title: "Setting updated",
                      description: "Profile visibility preference saved.",
                    })
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="team">Team Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {profileVisibility === 'public' && 'Anyone can see your profile'}
                    {profileVisibility === 'private' && 'Only you can see your profile'}
                    {profileVisibility === 'team' && 'Only team members can see your profile'}
                  </p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Email Address</Label>
                    <p className="text-sm text-muted-foreground">
                      Display your email address on your profile
                    </p>
                  </div>
                  <Switch
                    checked={showEmail}
                    onCheckedChange={(checked) => {
                      setShowEmail(checked)
                      savePrivacySettings(checked, undefined)
                      toast({
                        title: "Setting updated",
                        description: "Email visibility preference saved.",
                      })
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Projects</Label>
                    <p className="text-sm text-muted-foreground">
                      Display your projects on your profile
                    </p>
                  </div>
                  <Switch
                    checked={showProjects}
                    onCheckedChange={(checked) => {
                      setShowProjects(checked)
                      savePrivacySettings(undefined, checked)
                      toast({
                        title: "Setting updated",
                        description: "Project visibility preference saved.",
                      })
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize the look and feel of your interface
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select value={theme} onValueChange={(value) => {
                    setTheme(value)
                    toast({
                      title: "Theme updated",
                      description: `Switched to ${value} theme.`,
                    })
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Choose your preferred color scheme. System will follow your device settings.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
