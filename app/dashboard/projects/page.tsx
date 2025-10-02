"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  BeakerIcon,
  FolderIcon,
  DocumentTextIcon,
  LinkIcon,
  TagIcon,
  CalendarIcon,
  UserGroupIcon,
  PlusIcon,
  BellIcon,
  Cog6ToothIcon,
  ArrowLeftIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ProjectsPage() {
  const [user, setUser] = useState<any>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("labsos_authenticated")
    const userData = localStorage.getItem("labsos_user")

    if (!isAuthenticated || !userData) {
      router.push("/login")
      return
    }

    setUser(JSON.parse(userData))
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem("labsos_authenticated")
    localStorage.removeItem("labsos_user")
    router.push("/")
  }

  const projects = [
    {
      id: 1,
      name: "RNA-seq Analysis Pipeline",
      description:
        "Comprehensive pipeline for RNA sequencing data analysis including quality control, alignment, and differential expression analysis.",
      status: "Active",
      language: "Python",
      lastUpdated: "2 hours ago",
      color: "bg-green-500",
      collaborators: ["JS", "MJ", "AK"],
      tags: ["RNA-seq", "Bioinformatics", "Pipeline"],
      repository: "github.com/lab/rna-seq-pipeline",
      createdDate: "2024-01-15",
    },
    {
      id: 2,
      name: "Protein Structure Prediction",
      description:
        "Machine learning approach to predict protein structures using AlphaFold and custom neural networks.",
      status: "Review",
      language: "R",
      lastUpdated: "1 day ago",
      color: "bg-blue-500",
      collaborators: ["MJ", "RK"],
      tags: ["Protein", "ML", "Structure"],
      repository: "github.com/lab/protein-prediction",
      createdDate: "2024-02-01",
    },
    {
      id: 3,
      name: "GWAS Meta-Analysis",
      description: "Large-scale genome-wide association study meta-analysis across multiple cohorts.",
      status: "Draft",
      language: "Python",
      lastUpdated: "3 days ago",
      color: "bg-yellow-500",
      collaborators: ["AK", "JS"],
      tags: ["GWAS", "Genetics", "Meta-analysis"],
      repository: "github.com/lab/gwas-meta",
      createdDate: "2024-01-20",
    },
    {
      id: 4,
      name: "Single Cell RNA-seq",
      description: "Single cell transcriptomics analysis pipeline for developmental biology studies.",
      status: "Planning",
      language: "R",
      lastUpdated: "1 week ago",
      color: "bg-purple-500",
      collaborators: ["RK"],
      tags: ["scRNA-seq", "Development", "Clustering"],
      repository: null,
      createdDate: "2024-02-10",
    },
  ]

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-2">
              <BeakerIcon className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">LabsOS</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm">
              <BellIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm">
              <Cog6ToothIcon className="h-5 w-5" />
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {user.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!selectedProject ? (
          <>
            {/* Projects Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Projects</h1>
                <p className="text-muted-foreground">Manage your research projects and collaborations</p>
              </div>
              <Button onClick={() => setShowNewProject(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </div>

            {/* Project Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setSelectedProject(project)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-4 h-4 rounded-full ${project.color} mt-1`}></div>
                      <Button variant="ghost" size="sm">
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {project.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{project.language}</Badge>
                        <Badge variant="outline">{project.status}</Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {project.collaborators.map((collab, index) => (
                          <Avatar key={index} className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-xs">{collab}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">Updated {project.lastUpdated}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          /* Project Detail View */
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)}>
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
              <div className={`w-4 h-4 rounded-full ${selectedProject.color}`}></div>
              <h1 className="text-3xl font-bold text-foreground">{selectedProject.name}</h1>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {/* Project Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground">{selectedProject.description}</p>

                    <div className="flex flex-wrap gap-2">
                      {selectedProject.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary">
                          <TagIcon className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {selectedProject.repository && (
                      <div className="flex items-center gap-2 text-sm">
                        <LinkIcon className="h-4 w-4" />
                        <a href={`https://${selectedProject.repository}`} className="text-primary hover:underline">
                          {selectedProject.repository}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">JS</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">John Smith</span> updated quality control script
                          <div className="text-muted-foreground">2 hours ago</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">MJ</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">Maria Johnson</span> added documentation for alignment step
                          <div className="text-muted-foreground">1 day ago</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">AK</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <span className="font-medium">Alex Kim</span> linked new dataset
                          <div className="text-muted-foreground">3 days ago</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Files & Documentation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DocumentTextIcon className="h-5 w-5" />
                      Files & Documentation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { name: "README.md", type: "Documentation", size: "2.4 KB", updated: "2 hours ago" },
                      { name: "quality_control.py", type: "Script", size: "15.2 KB", updated: "2 hours ago" },
                      { name: "alignment.sh", type: "Script", size: "3.1 KB", updated: "1 day ago" },
                      { name: "sample_metadata.csv", type: "Dataset", size: "45.7 KB", updated: "3 days ago" },
                      { name: "analysis_protocol.md", type: "Documentation", size: "8.9 KB", updated: "1 week ago" },
                    ].map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <DocumentTextIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{file.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {file.size} • Updated {file.updated}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {file.type}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Project Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Created:</span>
                        <span>{selectedProject.createdDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <TagIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Language:</span>
                        <Badge variant="secondary">{selectedProject.language}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <FolderIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant="outline">{selectedProject.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Collaborators */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserGroupIcon className="h-5 w-5" />
                      Collaborators
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { initials: "JS", name: "John Smith", role: "Lead Developer" },
                      { initials: "MJ", name: "Maria Johnson", role: "Bioinformatician" },
                      { initials: "AK", name: "Alex Kim", role: "Data Analyst" },
                    ].map((collab, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{collab.initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">{collab.name}</div>
                          <div className="text-xs text-muted-foreground">{collab.role}</div>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full mt-3 bg-transparent">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Collaborator
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Create New Project</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowNewProject(false)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name *</Label>
                  <Input id="project-name" placeholder="e.g., RNA-seq Analysis Pipeline" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-description">Description</Label>
                  <Textarea
                    id="project-description"
                    placeholder="Brief description of your research project..."
                    rows={3}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="project-language">Primary Language</Label>
                    <Input id="project-language" placeholder="Python, R, MATLAB..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-status">Status</Label>
                    <Input id="project-status" placeholder="Planning, Active, Review..." />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-tags">Tags</Label>
                  <Input id="project-tags" placeholder="RNA-seq, Bioinformatics, Pipeline (comma separated)" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-repository">Repository URL (optional)</Label>
                  <Input id="project-repository" placeholder="https://github.com/lab/project-name" />
                </div>

                <Separator />

                <div className="flex gap-4">
                  <Button type="submit" className="flex-1">
                    Create Project
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowNewProject(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
