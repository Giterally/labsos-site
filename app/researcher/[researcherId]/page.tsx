"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeftIcon,
  BeakerIcon,
  UserGroupIcon,
  AcademicCapIcon,
  MapPinIcon,
  CalendarIcon,
  LinkIcon,
  FolderIcon,
  CodeBracketIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  CircleStackIcon,
  ShareIcon,
  EnvelopeIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"

interface ResearcherProfile {
  id: string
  name: string
  title: string
  email: string
  bio: string
  avatar?: string
  institution: string
  department: string
  location: string
  website?: string
  linkedin?: string
  orcid?: string
  joinedDate: string
  lastActive: string
  currentProjects: Array<{
    id: string
    name: string
    description: string
    status: "active" | "completed" | "paused"
    role: string
    startDate: string
    endDate?: string
    project: {
      id: string
      name: string
    }
  }>
  pastProjects: Array<{
    id: string
    name: string
    description: string
    status: "completed" | "archived"
    role: string
    startDate: string
    endDate: string
    project: {
      id: string
      name: string
    }
  }>
  publications: Array<{
    id: string
    title: string
    authors: string[]
    journal: string
    year: number
    doi?: string
    url?: string
  }>
  skills: string[]
  interests: string[]
  stats: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    publications: number
    collaborations: number
  }
}

export default function ResearcherProfilePage() {
  const router = useRouter()
  const params = useParams()
  const researcherId = params.researcherId as string

  const [researcher, setResearcher] = useState<ResearcherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchResearcher = async () => {
      try {
        const response = await fetch(`/api/researcher/${researcherId}`)
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Researcher profile not found')
          } else {
            setError('Failed to load researcher profile')
          }
          setLoading(false)
          return
        }

        const data = await response.json()
        setResearcher(data.researcher)
        setLoading(false)
      } catch (err) {
        console.error('Error fetching researcher:', err)
        setError('Failed to load researcher profile')
        setLoading(false)
      }
    }

    fetchResearcher()
  }, [researcherId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "paused":
        return "bg-yellow-100 text-yellow-800"
      case "archived":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Profile...</h1>
          <p className="text-muted-foreground">Please wait while we fetch the researcher's information.</p>
        </div>
      </div>
    )
  }

  if (error || !researcher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Profile Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The researcher profile you're looking for doesn't exist."}
          </p>
          <Button onClick={() => router.push("/")}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center space-x-2">
              <BeakerIcon className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold text-foreground">Researcher Profile</span>
            </div>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/login")}>
            Sign In
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Card */}
            <Card>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <Avatar className="h-24 w-24 mx-auto">
                    <AvatarFallback className="text-2xl font-semibold bg-primary text-primary-foreground">
                      {researcher.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{researcher.name}</h1>
                    <p className="text-lg text-muted-foreground">{researcher.title}</p>
                    <p className="text-sm text-muted-foreground">{researcher.institution}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                      <MapPinIcon className="h-4 w-4" />
                      <span>{researcher.location}</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                      <CalendarIcon className="h-4 w-4" />
                      <span>Joined {new Date(researcher.joinedDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Contact Links */}
                  <div className="flex justify-center space-x-2">
                    {researcher.email && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${researcher.email}`}>
                          <EnvelopeIcon className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {researcher.website && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={researcher.website} target="_blank" rel="noopener noreferrer">
                          <GlobeAltIcon className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {researcher.linkedin && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={researcher.linkedin} target="_blank" rel="noopener noreferrer">
                          <LinkIcon className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UserGroupIcon className="h-5 w-5" />
                  <span>About</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {researcher.bio}
                </p>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AcademicCapIcon className="h-5 w-5" />
                  <span>Skills</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {researcher.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Interests */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BeakerIcon className="h-5 w-5" />
                  <span>Research Interests</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {researcher.interests.map((interest, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {interest}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total Projects:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.totalProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Active Projects:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.activeProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Publications:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.publications}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Collaborations:</span>
                  <span className="text-sm text-muted-foreground">{researcher.stats.collaborations}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Projects and Publications */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="projects" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="publications">Publications</TabsTrigger>
              </TabsList>

              <TabsContent value="projects" className="space-y-6">
                {/* Current Projects */}
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Current Projects</h2>
                  <div className="space-y-4">
                    {researcher.currentProjects.map((project) => (
                      <Card key={project.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-foreground mb-1">{project.name}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <UserGroupIcon className="h-3 w-3" />
                                  <span>{project.role}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <FolderIcon className="h-3 w-3" />
                                  <span>{project.project.name}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <CalendarIcon className="h-3 w-3" />
                                  <span>Started {new Date(project.startDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status}
                            </Badge>
                          </div>
                          <Link href={`/project/${project.project.id}`}>
                            <Button variant="outline" size="sm">
                              View Project
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Past Projects */}
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Past Projects</h2>
                  <div className="space-y-4">
                    {researcher.pastProjects.map((project) => (
                      <Card key={project.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-foreground mb-1">{project.name}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <UserGroupIcon className="h-3 w-3" />
                                  <span>{project.role}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <FolderIcon className="h-3 w-3" />
                                  <span>{project.project.name}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <CalendarIcon className="h-3 w-3" />
                                  <span>{new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status}
                            </Badge>
                          </div>
                          <Link href={`/project/${project.project.id}`}>
                            <Button variant="outline" size="sm">
                              View Project
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="publications" className="space-y-4">
                {researcher.publications.map((publication) => (
                  <Card key={publication.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <h3 className="font-semibold text-foreground">{publication.title}</h3>
                        <div className="text-sm text-muted-foreground">
                          <p className="mb-1">{publication.authors.join(", ")}</p>
                          <p className="mb-2">{publication.journal}, {publication.year}</p>
                          {publication.doi && (
                            <p className="text-xs">DOI: {publication.doi}</p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {publication.url && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={publication.url} target="_blank" rel="noopener noreferrer">
                                <LinkIcon className="h-4 w-4 mr-2" />
                                View Paper
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
