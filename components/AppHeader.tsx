"use client"

import { useRouter } from "next/navigation"
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
import { signOut } from "@/lib/auth-service"
import { useUser } from "@/lib/user-context"

interface AppHeaderProps {
  currentPage?: string
}

export default function AppHeader({ currentPage }: AppHeaderProps) {
  const router = useRouter()
  const { user, loading } = useUser()

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
              className="flex items-center space-x-3 px-4 py-4 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0"
            >
              <Image
                src="/olvaro-fin.png"
                alt="Olvaro Logo"
                width={64}
                height={64}
                className="h-16 w-16 mt-1"
              />
              <span className="font-bold text-xl">Olvaro</span>
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
                className="flex items-center space-x-1 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 [&_svg]:hover:!text-foreground"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
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
