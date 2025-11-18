"use client"

import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
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
import { Sun, Moon, CheckSquare } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { signOut } from "@/lib/auth-service"
import { useUser } from "@/lib/user-context"

interface AppHeaderProps {
  currentPage?: string
}

export default function AppHeader({ currentPage }: AppHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useUser()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isHomePage = pathname === "/"

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
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
        <div className="flex h-20 items-center justify-between">
          {/* Left side - Logo/Brand */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => router.push("/")}
              className="flex items-center space-x-3 px-4 py-7 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 rounded-lg transition-colors"
            >
              <Image
                src="/olvaro-logo.png"
                alt="Olvaro Logo"
                width={48}
                height={48}
                className="h-12 w-12 mt-1 pointer-events-none"
              />
              <span className="font-bold text-xl pointer-events-none">Olvaro</span>
            </Button>
            
            {/* Navigation breadcrumb */}
            {currentPage && (
              <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                <span>/</span>
                <span className="capitalize">{currentPage}</span>
              </div>
            )}

            {/* Homepage navigation links - only show on homepage */}
            {isHomePage && (
              <nav className="hidden md:flex items-center space-x-6 ml-6">
                <a 
                  href="#features" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Features
                </a>
                <a 
                  href="#faq" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  FAQ
                </a>
                <a 
                  href="#labs" 
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Research Projects
                </a>
                <button 
                  onClick={() => router.push('/?contact=true')}
                  className="text-muted-foreground hover:text-foreground transition-colors text-left"
                >
                  Contact
                </button>
              </nav>
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
                className="flex items-center space-x-1 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 [&_svg]:hover:!text-foreground"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/tasks")}
                className="flex items-center space-x-1 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 [&_svg]:hover:!text-foreground"
              >
                <CheckSquare className="h-4 w-4" />
                <span>Tasks & Work Logs</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/projects")}
                className="flex items-center space-x-1 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 [&_svg]:hover:!text-foreground"
              >
                <FolderIcon className="h-4 w-4" />
                <span>Projects</span>
              </Button>
              {/* Theme Toggle */}
              {mounted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="h-9 w-9 p-0 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5 text-yellow-500" />
                  ) : (
                    <Moon className="h-5 w-5 text-blue-400" />
                  )}
                  <span className="sr-only">Toggle theme</span>
                </Button>
              )}
            </div>

            {/* User profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 [&_[data-slot=avatar-fallback]]:hover:!text-foreground">
                  <Avatar className="h-8 w-8">
                    {user?.profile_picture_url ? (
                      <img 
                        src={user.profile_picture_url} 
                        alt="Profile" 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <AvatarFallback className="text-xs text-foreground">
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
                <DropdownMenuItem 
                  onClick={handleProfileClick}
                  className="focus:ring-0 focus:ring-offset-0 focus:outline-none focus:!bg-muted focus:!text-foreground hover:!bg-muted hover:!text-foreground [&_svg]:hover:!text-foreground [&_svg]:focus:!text-foreground"
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleSettingsClick}
                  className="focus:ring-0 focus:ring-offset-0 focus:outline-none focus:!bg-muted focus:!text-foreground hover:!bg-muted hover:!text-foreground [&_svg]:hover:!text-foreground [&_svg]:focus:!text-foreground"
                >
                  <CogIcon className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="focus:ring-0 focus:ring-offset-0 focus:outline-none focus:!bg-muted focus:!text-foreground hover:!bg-muted hover:!text-foreground [&_svg]:hover:!text-foreground [&_svg]:focus:!text-foreground"
                >
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
