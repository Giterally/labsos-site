"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeftIcon, PlusIcon, TrashIcon, PencilIcon } from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import ManageTeamForm from "@/components/forms/ManageTeamForm"

interface ExperimentTree {
  id: string
  name: string
  description: string
  status: string
  category: string
  node_count: number
}

interface Software {
  id: string
  name: string
  type: string
  category: string
  description: string
  version: string
  license_type: string
  license_cost: number | null
  license_period: string
  repository_url: string | null
  documentation_url: string | null
}

interface Dataset {
  id: string
  name: string
  type: string
  description: string
  format: string
  file_size: number | null
  size_unit: string
  access_level: string
  repository_url: string | null
}

interface Output {
  id: string
  type: string
  title: string
  description: string
  authors: string[]
  status: string
  date: string | null
  url: string | null
  doi: string | null
  journal: string | null
}

interface TeamMember {
  id: string
  user_id: string
  role: string
  initials: string
  joined_at: string
  left_at: string | null
  profile?: {
    id: string
    full_name: string
    email: string
  } | null
}

interface ProjectInfo {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export default function SimpleProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string
  
  const [experimentTrees, setExperimentTrees] = useState<ExperimentTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingTree, setEditingTree] = useState<ExperimentTree | null>(null)
  
  // Software state
  const [software, setSoftware] = useState<Software[]>([])
  const [softwareLoading, setSoftwareLoading] = useState(false)
  const [showSoftwareForm, setShowSoftwareForm] = useState(false)
  const [creatingSoftware, setCreatingSoftware] = useState(false)
  const [showEditSoftwareForm, setShowEditSoftwareForm] = useState(false)
  const [editingSoftware, setEditingSoftware] = useState<Software | null>(null)
  const [editingSoftwareState, setEditingSoftwareState] = useState(false)
  
  // Dataset state
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [showDatasetForm, setShowDatasetForm] = useState(false)
  const [creatingDataset, setCreatingDataset] = useState(false)
  const [showEditDatasetForm, setShowEditDatasetForm] = useState(false)
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null)
  const [editingDatasetState, setEditingDatasetState] = useState(false)
  
  // Output state
  const [outputs, setOutputs] = useState<Output[]>([])
  const [outputsLoading, setOutputsLoading] = useState(false)
  const [showOutputForm, setShowOutputForm] = useState(false)
  const [creatingOutput, setCreatingOutput] = useState(false)
  const [showEditOutputForm, setShowEditOutputForm] = useState(false)
  const [editingOutput, setEditingOutput] = useState<Output | null>(null)
  const [editingOutputState, setEditingOutputState] = useState(false)
  
  // Team member state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamMembersLoading, setTeamMembersLoading] = useState(false)
  const [showAddMemberForm, setShowAddMemberForm] = useState(false)

  // Function to refresh team members
  const refreshTeamMembers = async () => {
    try {
      setTeamMembersLoading(true)
      const response = await fetch(`/api/projects/${projectId}/team`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch team members')
      }
      
      const data = await response.json()
      setTeamMembers(data.members || [])
    } catch (err) {
      console.error('Error fetching team members:', err)
    } finally {
      setTeamMembersLoading(false)
    }
  }
  
  // Project info state
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)

  // Fetch project information
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch project information')
        }
        
        const data = await response.json()
        setProjectInfo(data.project)
      } catch (err) {
        console.error('Error fetching project info:', err)
      }
    }

    fetchProjectInfo()
  }, [projectId])

  // Fetch experiment trees for this project
  useEffect(() => {
    const fetchExperimentTrees = async () => {
      try {
        setLoading(true)
        setError(null) // Clear any previous errors
        
        // For now, no authentication required
        // TODO: Implement proper project ownership and member system
        const response = await fetch(`/api/projects/${projectId}/trees`)
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('You are not authorized to view this project')
          } else if (response.status === 404) {
            throw new Error('Project not found')
          } else {
            const errorData = await response.json().catch(() => ({}))
            const errorMessage = errorData.details ? 
              `${errorData.error}: ${errorData.details}` : 
              `Failed to fetch experiment trees (${response.status})`
            throw new Error(errorMessage)
          }
        }
        
        const data = await response.json()
        setExperimentTrees(data.trees || [])
      } catch (err) {
        console.error('Error fetching experiment trees:', err)
        setError(err instanceof Error ? err.message : 'Failed to load experiment trees')
      } finally {
        setLoading(false)
      }
    }

    fetchExperimentTrees()
  }, [projectId])

  // Fetch software for this project
  useEffect(() => {
    const fetchSoftware = async () => {
      try {
        setSoftwareLoading(true)
        const response = await fetch(`/api/projects/${projectId}/software`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch software')
        }
        
        const data = await response.json()
        setSoftware(data.software || [])
      } catch (err) {
        console.error('Error fetching software:', err)
      } finally {
        setSoftwareLoading(false)
      }
    }

    fetchSoftware()
  }, [projectId])

  // Fetch datasets for this project
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setDatasetsLoading(true)
        const response = await fetch(`/api/projects/${projectId}/datasets`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch datasets')
        }
        
        const data = await response.json()
        setDatasets(data.datasets || [])
      } catch (err) {
        console.error('Error fetching datasets:', err)
      } finally {
        setDatasetsLoading(false)
      }
    }

    fetchDatasets()
  }, [projectId])

  // Fetch outputs for this project
  useEffect(() => {
    const fetchOutputs = async () => {
      try {
        setOutputsLoading(true)
        const response = await fetch(`/api/projects/${projectId}/outputs`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch outputs')
        }
        
        const data = await response.json()
        setOutputs(data.outputs || [])
      } catch (err) {
        console.error('Error fetching outputs:', err)
      } finally {
        setOutputsLoading(false)
      }
    }

    fetchOutputs()
  }, [projectId])

  // Fetch team members for this project
  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setTeamMembersLoading(true)
        const response = await fetch(`/api/projects/${projectId}/team`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch team members')
        }
        
        const data = await response.json()
        setTeamMembers(data.members || [])
      } catch (err) {
        console.error('Error fetching team members:', err)
      } finally {
        setTeamMembersLoading(false)
      }
    }

    fetchTeamMembers()
  }, [projectId])

  // Create new experiment tree
  const createExperimentTree = async (name: string, description: string, category: string) => {
    try {
      setCreating(true)
      
      // For now, no authentication required
      // TODO: Implement proper project ownership and member system
      const response = await fetch(`/api/projects/${projectId}/trees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          category,
          status: 'draft'
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details ? 
          `${errorData.error}: ${errorData.details}` : 
          errorData.error || 'Failed to create experiment tree'
        throw new Error(errorMessage)
      }

      const data = await response.json()
      setExperimentTrees(prev => [...prev, data.tree])
      setShowCreateForm(false)
    } catch (err) {
      console.error('Error creating experiment tree:', err)
      alert('Failed to create experiment tree: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  // Edit experiment tree
  const editExperimentTree = async (treeId: string, name: string, description: string, category: string) => {
    try {
      setEditing(true)
      
      const response = await fetch(`/api/trees/${treeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          category
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details ? 
          `${errorData.error}: ${errorData.details}` : 
          errorData.error || 'Failed to update experiment tree'
        throw new Error(errorMessage)
      }

      const data = await response.json()
      setExperimentTrees(prev => prev.map(tree => 
        tree.id === treeId ? { ...tree, name, description, category } : tree
      ))
      setShowEditForm(false)
      setEditingTree(null)
    } catch (err) {
      console.error('Error updating experiment tree:', err)
      alert('Failed to update experiment tree: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setEditing(false)
    }
  }

  // Delete experiment tree
  const deleteExperimentTree = async (treeId: string, treeName: string) => {
    if (!confirm(`Are you sure you want to delete "${treeName}"? This action cannot be undone.`)) {
      return
    }

    try {
      // For now, no authentication required
      // TODO: Implement proper project ownership and member system
      const response = await fetch(`/api/trees/${treeId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete experiment tree')
      }

      setExperimentTrees(prev => prev.filter(tree => tree.id !== treeId))
    } catch (err) {
      console.error('Error deleting experiment tree:', err)
      alert('Failed to delete experiment tree: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Software management functions
  const createSoftware = async (name: string, type: string, category: string, description: string, version: string, license_type: string, license_cost: number | null, license_period: string, repository_url: string | null, documentation_url: string | null) => {
    try {
      setCreatingSoftware(true)
      
      const response = await fetch(`/api/projects/${projectId}/software`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          type,
          category,
          description,
          version,
          license_type,
          license_cost,
          license_period,
          repository_url,
          documentation_url
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create software')
      }

      const data = await response.json()
      setSoftware(prev => [...prev, data.software])
      setShowSoftwareForm(false)
    } catch (err) {
      console.error('Error creating software:', err)
      alert('Failed to create software: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreatingSoftware(false)
    }
  }

  const editSoftware = async (softwareId: string, name: string, type: string, category: string, description: string, version: string, license_type: string, license_cost: number | null, license_period: string, repository_url: string | null, documentation_url: string | null) => {
    try {
      setEditingSoftwareState(true)
      
      const response = await fetch(`/api/software/${softwareId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          type,
          category,
          description,
          version,
          license_type,
          license_cost,
          license_period,
          repository_url,
          documentation_url
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update software')
      }

      const data = await response.json()
      setSoftware(prev => prev.map(s => s.id === softwareId ? data.software : s))
      setShowEditSoftwareForm(false)
      setEditingSoftware(null)
    } catch (err) {
      console.error('Error updating software:', err)
      alert('Failed to update software: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setEditingSoftwareState(false)
    }
  }

  const deleteSoftware = async (softwareId: string, softwareName: string) => {
    if (!confirm(`Are you sure you want to delete "${softwareName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/software/${softwareId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete software')
      }

      setSoftware(prev => prev.filter(s => s.id !== softwareId))
    } catch (err) {
      console.error('Error deleting software:', err)
      alert('Failed to delete software: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Dataset management functions
  const createDataset = async (name: string, type: string, description: string, format: string, file_size: number | null, size_unit: string, access_level: string, repository_url: string | null) => {
    try {
      setCreatingDataset(true)
      
      const response = await fetch(`/api/projects/${projectId}/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          type,
          description,
          format,
          file_size,
          size_unit,
          access_level,
          repository_url
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create dataset')
      }

      const data = await response.json()
      setDatasets(prev => [...prev, data.dataset])
      setShowDatasetForm(false)
    } catch (err) {
      console.error('Error creating dataset:', err)
      alert('Failed to create dataset: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreatingDataset(false)
    }
  }

  const editDataset = async (datasetId: string, name: string, type: string, description: string, format: string, file_size: number | null, size_unit: string, access_level: string, repository_url: string | null) => {
    try {
      setEditingDatasetState(true)
      
      const response = await fetch(`/api/datasets/${datasetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          type,
          description,
          format,
          file_size,
          size_unit,
          access_level,
          repository_url
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update dataset')
      }

      const data = await response.json()
      setDatasets(prev => prev.map(d => d.id === datasetId ? data.dataset : d))
      setShowEditDatasetForm(false)
      setEditingDataset(null)
    } catch (err) {
      console.error('Error updating dataset:', err)
      alert('Failed to update dataset: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setEditingDatasetState(false)
    }
  }

  const deleteDataset = async (datasetId: string, datasetName: string) => {
    if (!confirm(`Are you sure you want to delete "${datasetName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/datasets/${datasetId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete dataset')
      }

      setDatasets(prev => prev.filter(d => d.id !== datasetId))
    } catch (err) {
      console.error('Error deleting dataset:', err)
      alert('Failed to delete dataset: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Team member management functions
  const handleMemberAdded = () => {
    // Refresh team members list
    const fetchTeamMembers = async () => {
      try {
        setTeamMembersLoading(true)
        const response = await fetch(`/api/projects/${projectId}/team`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch team members')
        }
        
        const data = await response.json()
        setTeamMembers(data.members || [])
      } catch (err) {
        console.error('Error fetching team members:', err)
      } finally {
        setTeamMembersLoading(false)
      }
    }

    fetchTeamMembers()
  }

  const removeTeamMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove "${memberName}" from the team?`)) {
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/team/${memberId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to remove team member')
      }

      setTeamMembers(prev => prev.filter(member => member.id !== memberId))
    } catch (err) {
      console.error('Error removing team member:', err)
      alert('Failed to remove team member: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 pt-20">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/projects")}
            className="flex items-center space-x-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Back to Projects</span>
          </Button>
        </div>
        
        {/* Project Header */}
        {projectInfo && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-3xl mb-2">{projectInfo.name}</CardTitle>
                    {projectInfo.description && (
                      <CardDescription className="text-lg mb-4">
                        {projectInfo.description}
                      </CardDescription>
                    )}
                    <div className="flex items-center space-x-4">
                      <Badge variant="outline" className={
                        projectInfo.status === 'active' ? 'bg-green-100 text-green-800' :
                        projectInfo.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        projectInfo.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        'bg-orange-100 text-orange-800'
                      }>
                        {projectInfo.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}
        
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>Project Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Institution:</span>
                    <span className="text-sm text-muted-foreground">University of Science</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm text-muted-foreground">Bioinformatics</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge className={
                      projectInfo?.status === 'active' ? 'bg-green-100 text-green-800' :
                      projectInfo?.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                      projectInfo?.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-orange-100 text-orange-800'
                    }>
                      {projectInfo?.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Team Size:</span>
                    <span className="text-sm text-muted-foreground">{teamMembers.length} members</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Members */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Team Members</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddMemberForm(true)}
                    className="flex items-center space-x-1"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Add</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {teamMembersLoading ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                      <p className="text-sm">Loading team members...</p>
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No team members yet.</p>
                      <p className="text-xs">Click "Add" to invite team members.</p>
                    </div>
                  ) : (
                    teamMembers.map((member) => {
                      const profileName = member.profile?.full_name || 'Unknown User'
                      const profileId = member.profile?.id || member.user_id
                      
                      return (
                        <div key={member.id} className="flex items-center justify-between group">
                          <div 
                            className="flex items-center space-x-3 cursor-pointer flex-1"
                            onClick={() => router.push(`/researcher/${profileId}`)}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">{member.initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium hover:text-primary transition-colors">
                                {profileName}
                              </p>
                              <p className="text-xs text-muted-foreground">{member.role}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTeamMember(member.id, profileName)
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="trees" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="trees">Experiment Trees</TabsTrigger>
                <TabsTrigger value="software">Software & Tools</TabsTrigger>
                <TabsTrigger value="datasets">Datasets</TabsTrigger>
                <TabsTrigger value="outputs">Outputs</TabsTrigger>
              </TabsList>

              <TabsContent value="trees" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Experiment Trees</CardTitle>
                        <CardDescription>
                          Manage your experimental workflows and protocols
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => setShowCreateForm(true)}
                        className="flex items-center space-x-2"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>New Tree</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                     <div className="space-y-4">
                       {loading ? (
                         <div className="text-center py-8 text-muted-foreground">
                           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                           <p>Loading experiment trees...</p>
                         </div>
                       ) : error ? (
                         <div className="text-center py-8 text-red-500">
                           <p>{error}</p>
                         </div>
                       ) : experimentTrees.length === 0 ? (
                         <div className="text-center py-8 text-muted-foreground">
                           <p>No experiment trees yet.</p>
                           <p className="text-sm">Create your first experiment tree to get started.</p>
                         </div>
                       ) : (
                         experimentTrees.map((tree) => (
                           <div 
                             key={tree.id}
                             className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                           >
                             <div 
                               className="cursor-pointer"
                               onClick={() => router.push(`/project/${projectId}/trees/${tree.id}`)}
                             >
                               <h3 className="font-semibold">{tree.name}</h3>
                               <p className="text-sm text-muted-foreground">{tree.description}</p>
                               <div className="flex items-center space-x-4 mt-2">
                                 <Badge variant="outline">{tree.node_count} nodes</Badge>
                                 <Badge variant="outline" className={
                                   tree.status === 'active' ? 'bg-green-100 text-green-800' :
                                   tree.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                   tree.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                                   'bg-orange-100 text-orange-800'
                                 }>
                                   {tree.status}
                                 </Badge>
                               </div>
                             </div>
                             <div className="flex items-center justify-end mt-3 pt-3 border-t space-x-2">
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={(e: React.MouseEvent) => {
                                   e.stopPropagation()
                                   setEditingTree(tree)
                                   setShowEditForm(true)
                                 }}
                                 className="flex items-center space-x-1"
                               >
                                 <PencilIcon className="h-4 w-4" />
                                 <span>Edit</span>
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={(e: React.MouseEvent) => {
                                   e.stopPropagation()
                                   deleteExperimentTree(tree.id, tree.name)
                                 }}
                                 className="flex items-center space-x-1 text-destructive hover:text-destructive"
                               >
                                 <TrashIcon className="h-4 w-4" />
                                 <span>Delete</span>
                               </Button>
                             </div>
                           </div>
                         ))
                       )}
                     </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="software" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Software & Tools</CardTitle>
                        <CardDescription>
                          Manage software, libraries, and tools used in your project
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => setShowSoftwareForm(true)}
                        className="flex items-center space-x-2"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add Software</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {softwareLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                          <p>Loading software...</p>
                        </div>
                      ) : software.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No software added yet.</p>
                          <p className="text-sm">Add software and tools used in your project.</p>
                        </div>
                      ) : (
                        software.map((item) => (
                          <div 
                            key={item.id}
                            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold">{item.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Version {item.version} - {item.category}
                                </p>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                )}
                                <div className="flex items-center space-x-4 mt-2">
                                  <Badge variant="outline">{item.type}</Badge>
                                  <Badge variant="outline">{item.license_type}</Badge>
                                  {item.repository_url && (
                                    <a 
                                      href={item.repository_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      Repository
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 ml-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingSoftware(item)
                                    setShowEditSoftwareForm(true)
                                  }}
                                  className="flex items-center space-x-1"
                                >
                                  <PencilIcon className="h-4 w-4" />
                                  <span>Edit</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteSoftware(item.id, item.name)}
                                  className="flex items-center space-x-1 text-destructive hover:text-destructive"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                  <span>Delete</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="datasets" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Datasets</CardTitle>
                    <CardDescription>
                      Organize and track your research datasets
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Sample_001_R1.fastq</h3>
                        <p className="text-sm text-muted-foreground">Raw Data - 2.4 GB</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Sample_001_R2.fastq</h3>
                        <p className="text-sm text-muted-foreground">Raw Data - 2.4 GB</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">processed_counts.csv</h3>
                        <p className="text-sm text-muted-foreground">Processed Data - 15 MB</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="outputs" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Outputs</CardTitle>
                    <CardDescription>
                      Manage research outputs like publications, reports, and results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Quality Control Report</h3>
                        <p className="text-sm text-muted-foreground">Report - Published</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Differential Expression Results</h3>
                        <p className="text-sm text-muted-foreground">Results - Draft</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">RNA-seq Analysis Paper</h3>
                        <p className="text-sm text-muted-foreground">Publication - In Review</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Create Experiment Tree Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create New Experiment Tree</CardTitle>
              <CardDescription>
                Create a new experiment tree to organize your research workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateTreeForm
                onSubmit={createExperimentTree}
                onCancel={() => setShowCreateForm(false)}
                loading={creating}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Experiment Tree Modal */}
      {showEditForm && editingTree && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit Experiment Tree</CardTitle>
              <CardDescription>
                Update the details of your experiment tree
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditTreeForm
                tree={editingTree}
                onSubmit={editExperimentTree}
                onCancel={() => {
                  setShowEditForm(false)
                  setEditingTree(null)
                }}
                loading={editing}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Software Modal */}
      {showSoftwareForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Add Software</CardTitle>
              <CardDescription>
                Add software, libraries, and tools used in your project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SoftwareForm
                onSubmit={(name, _, type, category, description, version, license_type, license_cost, license_period, repository_url, documentation_url) => {
                  createSoftware(name, type, category, description, version, license_type, license_cost, license_period, repository_url, documentation_url)
                }}
                onCancel={() => setShowSoftwareForm(false)}
                loading={creatingSoftware}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Software Modal */}
      {showEditSoftwareForm && editingSoftware && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Edit Software</CardTitle>
              <CardDescription>
                Update software details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SoftwareForm
                software={editingSoftware}
                onSubmit={(softwareId, name, type, category, description, version, license_type, license_cost, license_period, repository_url, documentation_url) => {
                  editSoftware(softwareId, name, type, category, description, version, license_type, license_cost, license_period, repository_url, documentation_url)
                }}
                onCancel={() => {
                  setShowEditSoftwareForm(false)
                  setEditingSoftware(null)
                }}
                loading={editingSoftwareState}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Team Member Modal */}
      {showAddMemberForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <ManageTeamForm
            projectId={projectId}
            members={teamMembers.map(member => ({
              id: member.id,
              name: member.profile?.full_name || 'Unknown',
              email: member.profile?.email || 'unknown@example.com',
              role: member.role,
              avatar_url: undefined
            }))}
            onTeamUpdated={(updatedMembers) => {
              // Refresh the team members from the database
              refreshTeamMembers()
              setShowAddMemberForm(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

// Create Tree Form Component
function CreateTreeForm({ 
  onSubmit, 
  onCancel, 
  loading 
}: { 
  onSubmit: (name: string, description: string, category: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('protocol')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim(), description.trim(), category)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Quality Control Pipeline"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this experiment tree is for..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_collection">Data Collection</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={loading || !name.trim()} className="flex-1">
          {loading ? 'Creating...' : 'Create Tree'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Edit Tree Form Component
function EditTreeForm({ 
  tree,
  onSubmit, 
  onCancel, 
  loading 
}: { 
  tree: ExperimentTree
  onSubmit: (treeId: string, name: string, description: string, category: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState(tree.name)
  const [description, setDescription] = useState(tree.description)
  const [category, setCategory] = useState(tree.category)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(tree.id, name.trim(), description.trim(), category)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Quality Control Pipeline"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this experiment tree is for..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_collection">Data Collection</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={loading || !name.trim()} className="flex-1">
          {loading ? 'Updating...' : 'Update Tree'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Software Form Component
function SoftwareForm({ 
  software,
  onSubmit, 
  onCancel, 
  loading 
}: { 
  software?: Software
  onSubmit: (softwareIdOrName: string, name: string, type: string, category: string, description: string, version: string, license_type: string, license_cost: number | null, license_period: string, repository_url: string | null, documentation_url: string | null) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState(software?.name || '')
  const [type, setType] = useState(software?.type || 'external')
  const [category, setCategory] = useState(software?.category || 'other')
  const [description, setDescription] = useState(software?.description || '')
  const [version, setVersion] = useState(software?.version || '')
  const [license_type, setLicenseType] = useState(software?.license_type || 'free')
  const [license_cost, setLicenseCost] = useState(software?.license_cost || null)
  const [license_period, setLicensePeriod] = useState(software?.license_period || 'one_time')
  const [repository_url, setRepositoryUrl] = useState(software?.repository_url || '')
  const [documentation_url, setDocumentationUrl] = useState(software?.documentation_url || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      if (software) {
        // Editing existing software - pass softwareId as first param, then name from form
        onSubmit(
          software.id,
          name.trim(),
          type,
          category,
          description.trim(),
          version.trim(),
          license_type,
          license_cost,
          license_period,
          repository_url.trim() || null,
          documentation_url.trim() || null
        )
      } else {
        // Creating new software
        onSubmit(
          name.trim(),
          name.trim(),
          type,
          category,
          description.trim(),
          version.trim(),
          license_type,
          license_cost,
          license_period,
          repository_url.trim() || null,
          documentation_url.trim() || null
        )
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., FastQC"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Version</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g., 0.11.9"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="external">External</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="analysis">Analysis</option>
            <option value="visualization">Visualization</option>
            <option value="data_processing">Data Processing</option>
            <option value="simulation">Simulation</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this software does..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">License Type</label>
          <select
            value={license_type}
            onChange={(e) => setLicenseType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="academic">Academic</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">License Cost</label>
          <input
            type="number"
            value={license_cost || ''}
            onChange={(e) => setLicenseCost(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">License Period</label>
          <select
            value={license_period}
            onChange={(e) => setLicensePeriod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="one_time">One Time</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Repository URL</label>
          <input
            type="url"
            value={repository_url}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Documentation URL</label>
          <input
            type="url"
            value={documentation_url}
            onChange={(e) => setDocumentationUrl(e.target.value)}
            placeholder="https://docs.example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={loading || !name.trim()} className="flex-1">
          {loading ? (software ? 'Updating...' : 'Creating...') : (software ? 'Update Software' : 'Add Software')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

