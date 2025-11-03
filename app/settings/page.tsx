'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  
  // Privacy settings
  const [profileVisibility, setProfileVisibility] = useState('public')
  const [showEmail, setShowEmail] = useState(false)
  const [showProjects, setShowProjects] = useState(true)
  
  // Loading states
  const [loading, setLoading] = useState(true)

  // Load user settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // In a real app, you'd fetch from your API
        // For now, we'll use localStorage or default values
        const savedSettings = localStorage.getItem('userSettings')
        if (savedSettings) {
          const settings = JSON.parse(savedSettings)
          setProfileVisibility(settings.profileVisibility || 'public')
          setShowEmail(settings.showEmail ?? false)
          setShowProjects(settings.showProjects ?? true)
        }
      } catch (error) {
        console.error('Error loading settings:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Auto-save settings when they change
  useEffect(() => {
    if (!loading) {
      const settings = {
        profileVisibility,
        showEmail,
        showProjects
      }
      localStorage.setItem('userSettings', JSON.stringify(settings))
    }
  }, [profileVisibility, showEmail, showProjects, loading])


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
        <Tabs defaultValue="privacy" className="space-y-6">
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
