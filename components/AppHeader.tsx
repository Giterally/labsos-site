"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CogIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  HomeIcon,
  FolderIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline"
import { getCurrentUser, signOut, onAuthStateChange, User } from "@/lib/auth-service"

interface AppHeaderProps {
  currentPage?: string
}

export default function AppHeader({ currentPage }: AppHeaderProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial user
    getCurrentUser().then((user) => {
      setUser(user)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    // Set up auth state listener
    const { data: { subscription } } = onAuthStateChange((user) => {
      setUser(user)
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push("/login")
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleProfileClick = () => {
    router.push("/profile")
  }

  const handleSettingsClick = () => {
    router.push('/settings')
  }

  // Don't show header if not authenticated or still loading
  if (loading || !user) {
    return null
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left side - Logo/Brand */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="flex items-center space-x-2"
            >
              <BeakerIcon className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">LabsOS</span>
            </Button>
            
            {/* Navigation breadcrumb */}
            {currentPage && (
              <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                <span>/</span>
                <span className="capitalize">{currentPage}</span>
              </div>
            )}
          </div>

          {/* Right side - User menu and settings */}
          <div className="flex items-center space-x-4">
            {/* Quick navigation buttons */}
            <div className="hidden md:flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="flex items-center space-x-1"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/projects")}
                className="flex items-center space-x-1"
              >
                <FolderIcon className="h-4 w-4" />
                <span>Projects</span>
              </Button>
            </div>

            {/* Settings button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSettingsClick}
              className="flex items-center space-x-1"
            >
              <CogIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>

            {/* User profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    {user?.profile_picture_url ? (
                      <img 
                        src={user.profile_picture_url} 
                        alt="Profile" 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <AvatarFallback className="text-xs">
                        {user?.full_name
                          ? user.full_name
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                          : "U"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.full_name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                    {user?.institution && (
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.institution}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleProfileClick}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/dashboard/projects")}>
                  <FolderIcon className="mr-2 h-4 w-4" />
                  <span>My Projects</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
