"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BeakerIcon,
  ArrowLeftIcon,
  PlusIcon,
  FolderIcon,
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  ArrowRightOnRectangleIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  LinkIcon,
  ComputerDesktopIcon,
  ServerIcon,
  CircleStackIcon,
  UserIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import AddExperimentTreeForm from "@/components/forms/AddExperimentTreeForm"
import AddSoftwareForm from "@/components/forms/AddSoftwareForm"
import AddOutputForm from "@/components/forms/AddOutputForm"
import EditProjectForm from "@/components/forms/EditProjectForm"
import ManageTeamForm from "@/components/forms/ManageTeamForm"
import ManageExperimentTreesForm from "@/components/forms/ManageExperimentTreesForm"
import ManageSoftwareForm from "@/components/forms/ManageSoftwareForm"
import ManageOutputsForm from "@/components/forms/ManageOutputsForm"
import { getCurrentUser, signOut, onAuthStateChange, User } from "@/lib/auth-service"
import { supabase } from "@/lib/supabase-client"

interface Project {
  id: string
  name: string
  description: string | null
  institution: string | null
  department: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  created_by: string | null
  created_at: string
  updated_at: string
  // Related data
  members?: any[]
  past_members?: any[]
  related_projects?: any[]
  experiment_trees?: ExperimentTree[]
  software?: any[]
  datasets?: any[]
  outputs?: any[]
  stats?: {
    total_trees: number
    active_trees: number
    completed_trees: number
    total_nodes: number
    total_software: number
    total_datasets: number
    total_outputs: number
    total_publications: number
    total_citations: number
  }
}

interface ExperimentTree {
  id: string
  project_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  category: 'protocol' | 'analysis' | 'data_collection' | 'results'
  node_count: number
  node_types: {
    protocol: number
    data_creation: number
    analysis: number
    results: number
  }
  linked_datasets: string[]
  linked_software: string[]
  linked_outputs: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  // Edit dialog states
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [manageTeamOpen, setManageTeamOpen] = useState(false)
  const [manageTreesOpen, setManageTreesOpen] = useState(false)
  const [manageSoftwareOpen, setManageSoftwareOpen] = useState(false)
  const [manageOutputsOpen, setManageOutputsOpen] = useState(false)

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = onAuthStateChange((user, sessionId) => {
      if (user) {
        setUser(user)
      } else {
        setUser(null)
        router.push("/login")
      }
    })

    // Get initial user
    getCurrentUser().then((user) => {
      if (user) {
        setUser(user)
      } else {
        router.push("/login")
      }
    }).catch(() => {
      router.push("/login")
    })

    // Fetch project data immediately
    fetchProject()

    return () => {
      subscription?.unsubscribe()
    }
  }, [router, projectId])

  const fetchProject = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Use mock data for demonstration
      const mockProject: Project = {
        id: projectId,
        name: "RNA-seq Analysis Pipeline",
        description: "Comprehensive pipeline for RNA sequencing data analysis including quality control, alignment, and differential expression analysis.",
        institution: "University of Science",
        department: "Bioinformatics",
        status: 'active',
        created_by: 'user-1',
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        members: [
          {
            id: '1',
            role: 'Lead Developer',
            user: { full_name: 'John Smith', email: 'john@example.com' }
          },
          {
            id: '2', 
            role: 'Bioinformatician',
            user: { full_name: 'Maria Johnson', email: 'maria@example.com' }
          },
          {
            id: '3',
            role: 'Data Analyst', 
            user: { full_name: 'Alex Kim', email: 'alex@example.com' }
          }
        ],
        experiment_trees: [
          {
            id: 'tree-1',
            project_id: projectId,
            name: 'Quality Control Pipeline',
            description: 'RNA-seq quality control and preprocessing steps',
            status: 'active',
            category: 'protocol',
            node_count: 8,
            node_types: { protocol: 3, data_creation: 2, analysis: 2, results: 1 },
            linked_datasets: ['dataset-1', 'dataset-2'],
            linked_software: ['fastqc', 'trimmomatic'],
            linked_outputs: ['qc-report'],
            created_by: 'user-1',
            created_at: '2024-01-15T00:00:00Z',
            updated_at: '2024-01-15T00:00:00Z'
          },
          {
            id: 'tree-2',
            project_id: projectId,
            name: 'Differential Expression Analysis',
            description: 'Statistical analysis of gene expression differences',
            status: 'active',
            category: 'analysis',
            node_count: 6,
            node_types: { protocol: 1, data_creation: 1, analysis: 3, results: 1 },
            linked_datasets: ['dataset-3'],
            linked_software: ['deseq2', 'r'],
            linked_outputs: ['de-results'],
            created_by: 'user-1',
            created_at: '2024-01-16T00:00:00Z',
            updated_at: '2024-01-16T00:00:00Z'
          }
        ],
        software: [
          { id: '1', name: 'FastQC', version: '0.11.9', type: 'Quality Control' },
          { id: '2', name: 'Trimmomatic', version: '0.39', type: 'Preprocessing' },
          { id: '3', name: 'DESeq2', version: '1.38.3', type: 'Analysis' },
          { id: '4', name: 'R', version: '4.3.0', type: 'Programming Language' }
        ],
        datasets: [
          { id: '1', name: 'Sample_001_R1.fastq', type: 'Raw Data', size: '2.4 GB' },
          { id: '2', name: 'Sample_001_R2.fastq', type: 'Raw Data', size: '2.4 GB' },
          { id: '3', name: 'processed_counts.csv', type: 'Processed Data', size: '15 MB' }
        ],
        outputs: [
          { id: '1', name: 'Quality Control Report', type: 'Report', status: 'Published' },
          { id: '2', name: 'Differential Expression Results', type: 'Results', status: 'Draft' },
          { id: '3', name: 'RNA-seq Analysis Paper', type: 'Publication', status: 'In Review' }
        ],
        stats: {
          total_trees: 2,
          active_trees: 2,
          completed_trees: 0,
          total_nodes: 14,
          total_software: 4,
          total_datasets: 3,
          total_outputs: 3,
          total_publications: 1,
          total_citations: 0
        }
      }
      
      setProject(mockProject)
    } catch (err: any) {
      console.error('Error fetching project:', err)
      setError(err.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      router.push("/")
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleProjectUpdated = (updatedProject: Project) => {
    setProject(updatedProject)
  }

  const handleTeamUpdated = (updatedMembers: any[]) => {
    if (project) {
      setProject({
        ...project,
        members: updatedMembers
      })
    }
  }

  const handleTreesUpdated = (updatedTrees: ExperimentTree[]) => {
    if (project) {
      setProject({
        ...project,
        experiment_trees: updatedTrees,
        stats: {
          ...project.stats,
          total_trees: updatedTrees.length,
          active_trees: updatedTrees.filter(t => t.status === 'active').length,
          completed_trees: updatedTrees.filter(t => t.status === 'completed').length,
          total_nodes: updatedTrees.reduce((sum, t) => sum + t.node_count, 0)
        }
      })
    }
  }

  const handleSoftwareUpdated = (updatedSoftware: any[]) => {
    if (project) {
      setProject({
        ...project,
        software: updatedSoftware,
        stats: {
          ...project.stats,
          total_software: updatedSoftware.length
        }
      })
    }
  }

  const handleOutputsUpdated = (updatedOutputs: any[]) => {
    if (project) {
      setProject({
        ...project,
        outputs: updatedOutputs,
        stats: {
          ...project.stats,
          total_outputs: updatedOutputs.length,
          total_publications: updatedOutputs.filter(o => o.type === 'publication').length
        }
      })
    }
  }

  const handleSoftwareAdded = (newSoftware: any) => {
    if (project) {
      setProject({
        ...project,
        software: [...(project.software || []), newSoftware],
        stats: {
          ...project.stats,
          total_software: (project.stats?.total_software || 0) + 1
        }
      })
    }
  }

  const handleOutputAdded = (newOutput: any) => {
    if (project) {
      setProject({
        ...project,
        outputs: [...(project.outputs || []), newOutput],
        stats: {
          ...project.stats,
          total_outputs: (project.stats?.total_outputs || 0) + 1,
          total_publications: newOutput.type === 'publication' ? (project.stats?.total_publications || 0) + 1 : (project.stats?.total_publications || 0)
        }
      })
    }
  }

  const handleTreeAdded = (newTree: ExperimentTree) => {
    if (project) {
      setProject({
        ...project,
        experiment_trees: [...(project.experiment_trees || []), newTree],
        stats: {
          ...project.stats,
          total_trees: (project.stats?.total_trees || 0) + 1,
          active_trees: newTree.status === 'active' ? (project.stats?.active_trees || 0) + 1 : (project.stats?.active_trees || 0)
        }
      })
    }
  }

  // Helper functions for styling
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "draft":
        return "bg-gray-100 text-gray-800"
      case "archived":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "protocol":
        return "bg-purple-100 text-purple-800"
      case "analysis":
        return "bg-blue-100 text-blue-800"
      case "data_collection":
        return "bg-orange-100 text-orange-800"
      case "results":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Project...</h1>
          <p className="text-muted-foreground">Please wait while we fetch your project details.</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Project Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The project you're looking for doesn't exist."}
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-2">
                <BeakerIcon className="h-6 w-6 text-primary" />
                <h1 className="text-lg font-semibold text-foreground">{project.name}</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {user && (
                <div className="flex items-center space-x-3 mr-4">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground">{user.full_name || user.email}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
                <PencilIcon className="h-4 w-4 mr-2" />
                Edit Project
              </Button>
              <AddExperimentTreeForm projectId={projectId} onTreeAdded={handleTreeAdded} />
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Column - Project Info & Team */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FolderIcon className="h-5 w-5" />
                    <span>Project Overview</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditProjectOpen(true)}>
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{project.description}</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Institution:</span>
                    <span className="text-sm text-muted-foreground">{project.institution}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm text-muted-foreground">{project.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge className={getStatusColor(project.status)}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Team Size:</span>
                    <span className="text-sm text-muted-foreground">{project.members?.length || 0} members</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Members */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <UserGroupIcon className="h-5 w-5" />
                    <span>Team Members</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setManageTeamOpen(true)}>
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.members?.map((member) => (
                    <div key={member.id} className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {member.user?.full_name ? member.user.full_name.charAt(0).toUpperCase() : member.user?.email?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.user?.full_name || member.user?.email}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                  ))}
                  {(!project.members || project.members.length === 0) && (
                    <p className="text-sm text-muted-foreground">No team members yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ChartBarIcon className="h-5 w-5" />
                  <span>Statistics</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total Trees:</span>
                  <span className="text-sm text-muted-foreground">{project.stats?.total_trees || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Active Trees:</span>
                  <span className="text-sm text-muted-foreground">{project.stats?.active_trees || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Software Tools:</span>
                  <span className="text-sm text-muted-foreground">{project.stats?.total_software || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Publications:</span>
                  <span className="text-sm text-muted-foreground">{project.stats?.total_publications || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Enhanced Tabs */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="trees" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="trees">Experiment Trees</TabsTrigger>
                <TabsTrigger value="software">Software & Tools</TabsTrigger>
                <TabsTrigger value="datasets">Datasets</TabsTrigger>
                <TabsTrigger value="outputs">Outputs</TabsTrigger>
              </TabsList>

              {/* Enhanced Experiment Trees */}
              <TabsContent value="trees" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-foreground">Experiment Trees</h2>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => setManageTreesOpen(true)}>
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Manage Trees
                    </Button>
                    <AddExperimentTreeForm projectId={projectId} onTreeAdded={handleTreeAdded} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {project.experiment_trees?.map((tree) => (
                    <Link key={tree.id} href={`/project/${projectId}/trees/${tree.id}`}>
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{tree.name}</CardTitle>
                            <div className="flex space-x-1">
                              <Badge className={getCategoryColor(tree.category)}>
                                {tree.category}
                              </Badge>
                              <Badge className={getStatusColor(tree.status)}>
                                {tree.status}
                              </Badge>
                            </div>
                          </div>
                          <CardDescription>{tree.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {/* Node Type Breakdown */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Protocols:</span>
                                <span className="font-medium">{tree.node_types.protocol}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Data:</span>
                                <span className="font-medium">{tree.node_types.data_creation}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Analysis:</span>
                                <span className="font-medium">{tree.node_types.analysis}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Results:</span>
                                <span className="font-medium">{tree.node_types.results}</span>
                              </div>
                            </div>
                            
                            {/* Linked Resources */}
                            <div className="flex flex-wrap gap-1 text-xs">
                              {tree.linked_datasets.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  🗃️ {tree.linked_datasets.length} datasets
                                </Badge>
                              )}
                              {tree.linked_software.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  📱 {tree.linked_software.length} tools
                                </Badge>
                              )}
                              {tree.linked_outputs.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  📄 {tree.linked_outputs.length} outputs
                                </Badge>
                              )}
                            </div>

                            <div className="flex justify-between text-sm pt-2 border-t">
                              <span className="text-muted-foreground">Updated:</span>
                              <span className="font-medium">
                                {new Date(tree.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>

                {(!project.experiment_trees || project.experiment_trees.length === 0) && (
                  <Card className="text-center py-12">
                    <CardContent>
                      <FolderIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">No Experiment Trees Yet</h3>
                      <p className="text-muted-foreground mb-6">
                        Create your first experiment tree to start organizing your research workflow.
                      </p>
                      <AddExperimentTreeForm projectId={projectId} onTreeAdded={handleTreeAdded} />
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Software & Tools */}
              <TabsContent value="software" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-foreground">Software & Tools</h2>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => setManageSoftwareOpen(true)}>
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Manage Software
                    </Button>
                    <AddSoftwareForm projectId={projectId} onSoftwareAdded={handleSoftwareAdded} />
                  </div>
                </div>
                <Card className="text-center py-12">
                  <CardContent>
                    <ComputerDesktopIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Software Tracked Yet</h3>
                    <p className="text-muted-foreground mb-6">
                      Add software and tools used in this project to track dependencies and costs.
                    </p>
                    <AddSoftwareForm projectId={projectId} onSoftwareAdded={handleSoftwareAdded} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Datasets */}
              <TabsContent value="datasets" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-foreground">Datasets</h2>
                  <Button>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Add Dataset
                  </Button>
                </div>
                <Card className="text-center py-12">
                  <CardContent>
                    <CircleStackIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Datasets Yet</h3>
                    <p className="text-muted-foreground mb-6">
                      Add datasets to track your research data and link them to software and outputs.
                    </p>
                    <Button>
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Dataset
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Outputs */}
              <TabsContent value="outputs" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-foreground">Project Outputs</h2>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => setManageOutputsOpen(true)}>
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Manage Outputs
                    </Button>
                    <AddOutputForm projectId={projectId} onOutputAdded={handleOutputAdded} />
                  </div>
                </div>
                <Card className="text-center py-12">
                  <CardContent>
                    <DocumentTextIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Outputs Tracked Yet</h3>
                    <p className="text-muted-foreground mb-6">
                      Add publications, software, datasets, and other outputs from this project.
                    </p>
                    <AddOutputForm projectId={projectId} onOutputAdded={handleOutputAdded} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Edit Dialogs */}
      {project && (
        <>
          <EditProjectForm
            project={project}
            isOpen={editProjectOpen}
            onClose={() => setEditProjectOpen(false)}
            onUpdated={handleProjectUpdated}
          />
          <ManageTeamForm
            projectId={projectId}
            members={project.members || []}
            isOpen={manageTeamOpen}
            onClose={() => setManageTeamOpen(false)}
            onUpdated={handleTeamUpdated}
          />
          <ManageExperimentTreesForm
            projectId={projectId}
            trees={project.experiment_trees || []}
            isOpen={manageTreesOpen}
            onClose={() => setManageTreesOpen(false)}
            onUpdated={handleTreesUpdated}
          />
          <ManageSoftwareForm
            projectId={projectId}
            software={project.software || []}
            isOpen={manageSoftwareOpen}
            onClose={() => setManageSoftwareOpen(false)}
            onUpdated={handleSoftwareUpdated}
          />
          <ManageOutputsForm
            projectId={projectId}
            outputs={project.outputs || []}
            isOpen={manageOutputsOpen}
            onClose={() => setManageOutputsOpen(false)}
            onUpdated={handleOutputsUpdated}
          />
        </>
      )}
    </div>
  )
}
