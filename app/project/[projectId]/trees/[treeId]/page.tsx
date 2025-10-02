"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  ChevronRightIcon,
  ChevronDownIcon,
  PlayIcon,
  VideoCameraIcon,
  ShareIcon,
  Bars3Icon,
  XMarkIcon,
  WrenchScrewdriverIcon,
  CpuChipIcon,
  DocumentArrowDownIcon,
  PencilIcon,
} from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCurrentUser, signOut, onAuthStateChange, User } from "@/lib/auth-service"
import { supabase } from "@/lib/supabase-client"
import AddNodeForm from "@/components/forms/AddNodeForm"
import EditNodeForm from "@/components/forms/EditNodeForm"
import EditContentForm from "@/components/forms/EditContentForm"
import EditAttachmentsForm from "@/components/forms/EditAttachmentsForm"
import EditLinksForm from "@/components/forms/EditLinksForm"
import EditMetadataForm from "@/components/forms/EditMetadataForm"
import VideoEmbed from "@/components/VideoEmbed"
import { isVideoUrl } from "@/lib/video-utils"
import ExperimentStepsList from "@/components/ExperimentStepsList"
import { cn } from "@/lib/utils"

interface ExperimentTree {
  id: string
  project_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  category: 'protocol' | 'analysis' | 'data_collection' | 'results'
  node_count: number
  node_types: {
    data: number
    software_completed: number
    software_development: number
    results: number
    protocols: number
    final_outputs: number
  }
  linked_datasets: string[]
  linked_software: string[]
  linked_outputs: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

interface TreeNode {
  id: string
  tree_id: string
  parent_id: string | null
  name: string
  description: string | null
  node_type: 'data' | 'software_completed' | 'software_development' | 'results' | 'protocols' | 'final_outputs'
  position: number | null
  created_at: string
  updated_at: string
}

interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size?: number
}

interface Link {
  id: string
  name: string
  url: string
  type: 'github' | 'documentation' | 'paper' | 'youtube' | 'vimeo' | 'video' | 'other'
}

interface MetadataField {
  id: string
  key: string
  value: string
  type: 'text' | 'number' | 'boolean' | 'json'
}

export default function ExperimentTreePage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string
  const treeId = params.treeId as string

  const [tree, setTree] = useState<ExperimentTree | null>(null)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [treeSidebarOpen, setTreeSidebarOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [editNodeOpen, setEditNodeOpen] = useState(false)
  const [nodeToEdit, setNodeToEdit] = useState<TreeNode | null>(null)
  const [activeTab, setActiveTab] = useState("content")
  
  // Tab edit states
  const [editContentOpen, setEditContentOpen] = useState(false)
  const [editAttachmentsOpen, setEditAttachmentsOpen] = useState(false)
  const [editLinksOpen, setEditLinksOpen] = useState(false)
  const [editMetadataOpen, setEditMetadataOpen] = useState(false)
  
  // Tab data states
  const [nodeContent, setNodeContent] = useState("")
  const [nodeAttachments, setNodeAttachments] = useState<Attachment[]>([])
  const [nodeLinks, setNodeLinks] = useState<Link[]>([])
  const [nodeMetadata, setNodeMetadata] = useState<MetadataField[]>([])

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = onAuthStateChange((user) => {
      if (user) {
        setUser(user)
        fetchTree()
        fetchNodes()
      } else {
        setUser(null)
        router.push("/login")
      }
    })

    // Get initial user
    getCurrentUser().then((user) => {
      if (user) {
        setUser(user)
        fetchTree()
        fetchNodes()
      } else {
        router.push("/login")
      }
    }).catch(() => {
      router.push("/login")
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [router, projectId, treeId])

  const fetchTree = async () => {
    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/projects/${projectId}/trees/${treeId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch experiment tree')
      }

      const { tree } = await response.json()
      setTree(tree)
    } catch (err: any) {
      console.error('Error fetching tree:', err)
      setError(err.message || 'Failed to load experiment tree')
    }
  }

  const fetchNodes = async () => {
    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/trees/${treeId}/nodes`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch nodes')
      }

      const { nodes } = await response.json()
      setNodes(nodes)
    } catch (err: any) {
      console.error('Error fetching nodes:', err)
      // Don't set error for nodes, just log it
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

  const handleNodeAdded = (newNode: TreeNode) => {
    setNodes([...nodes, newNode])
    // Update tree node count
    if (tree) {
      setTree({
        ...tree,
        node_count: tree.node_count + 1,
        node_types: {
          ...tree.node_types,
          [newNode.node_type]: tree.node_types[newNode.node_type] + 1
        }
      })
    }
  }

  const handleNodeUpdated = (updatedNode: TreeNode) => {
    setNodes(nodes.map(node => node.id === updatedNode.id ? updatedNode : node))
    if (selectedNode?.id === updatedNode.id) {
      setSelectedNode(updatedNode)
      setNodeContent(updatedNode.description || "")
    }
  }

  const handleNodeDeleted = async (nodeToDelete: TreeNode) => {
    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete node')
      }

      setNodes(nodes.filter(node => node.id !== nodeToDelete.id))
      if (selectedNode?.id === nodeToDelete.id) {
        setSelectedNode(null)
      }

      // Update tree node count
      if (tree) {
        setTree({
          ...tree,
          node_count: tree.node_count - 1,
          node_types: {
            ...tree.node_types,
            [nodeToDelete.node_type]: tree.node_types[nodeToDelete.node_type] - 1
          }
        })
      }
    } catch (err: any) {
      console.error('Error deleting node:', err)
      alert('Failed to delete node: ' + err.message)
    }
  }

  const handleNodeMove = async (nodeId: string, newPosition: number) => {
    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          position: newPosition
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to move node')
      }

      const { node: updatedNode } = await response.json()
      setNodes(nodes.map(node => node.id === updatedNode.id ? updatedNode : node))
    } catch (err: any) {
      console.error('Error moving node:', err)
      alert('Failed to move node: ' + err.message)
    }
  }

  const handleNodeEdit = (node: TreeNode) => {
    setNodeToEdit(node)
    setEditNodeOpen(true)
  }

  const handleNodeSelect = (node: TreeNode) => {
    setSelectedNode(node)
    setNodeContent(node.description || "")
    // Reset tab data when selecting a new node
    setNodeAttachments([])
    setNodeLinks([])
    setNodeMetadata([])
  }

  const handleContentUpdated = (content: string) => {
    setNodeContent(content)
    // Update the selected node's description
    if (selectedNode) {
      const updatedNode = { ...selectedNode, description: content }
      setSelectedNode(updatedNode)
      setNodes(nodes.map(node => node.id === updatedNode.id ? updatedNode : node))
    }
  }

  const handleAttachmentsUpdated = (attachments: Attachment[]) => {
    setNodeAttachments(attachments)
  }

  const handleLinksUpdated = (links: Link[]) => {
    setNodeLinks(links)
  }

  const handleMetadataUpdated = (metadata: MetadataField[]) => {
    setNodeMetadata(metadata)
  }

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "data":
        return <CircleStackIcon className="h-4 w-4" />
      case "software_completed":
        return <CpuChipIcon className="h-4 w-4" />
      case "software_development":
        return <WrenchScrewdriverIcon className="h-4 w-4" />
      case "results":
        return <ChartBarIcon className="h-4 w-4" />
      case "protocols":
        return <DocumentTextIcon className="h-4 w-4" />
      case "final_outputs":
        return <DocumentArrowDownIcon className="h-4 w-4" />
      default:
        return <DocumentTextIcon className="h-4 w-4" />
    }
  }

  const getNodeTypeColor = (nodeType: string) => {
    switch (nodeType) {
      case "data":
        return "bg-blue-100 text-blue-800"
      case "software_completed":
        return "bg-green-100 text-green-800"
      case "software_development":
        return "bg-yellow-100 text-yellow-800"
      case "results":
        return "bg-purple-100 text-purple-800"
      case "protocols":
        return "bg-orange-100 text-orange-800"
      case "final_outputs":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getNodeTypeLabel = (nodeType: string) => {
    switch (nodeType) {
      case "data":
        return "Data"
      case "software_completed":
        return "Software (Completed)"
      case "software_development":
        return "Software (Development)"
      case "results":
        return "Results"
      case "protocols":
        return "Protocols"
      case "final_outputs":
        return "Final Outputs"
      default:
        return nodeType
    }
  }

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
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Experiment Tree...</h1>
          <p className="text-muted-foreground">Please wait while we fetch your experiment tree.</p>
        </div>
      </div>
    )
  }

  if (error || !tree) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Experiment Tree Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The experiment tree you're looking for doesn't exist."}
          </p>
          <Button onClick={() => router.push(`/project/${projectId}`)}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Project
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
              <Button variant="ghost" size="sm" onClick={() => router.push(`/project/${projectId}`)}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Project
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-2">
                <BeakerIcon className="h-6 w-6 text-primary" />
                <h1 className="text-lg font-semibold text-foreground">{tree.name}</h1>
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
              <Button variant="outline" size="sm">
                <CogIcon className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Experiment Steps */}
        <div className={cn(
          "w-80 border-r border-border bg-card transition-all duration-300 flex flex-col",
          treeSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          {/* Steps Header */}
          <div className="p-3 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Experiment Steps</h2>
              <div className="flex items-center space-x-2">
                <AddNodeForm treeId={treeId} nodes={nodes} onNodeAdded={handleNodeAdded} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTreeSidebarOpen(!treeSidebarOpen)}
                  className="lg:hidden h-6 w-6 p-0"
                >
                  <XMarkIcon className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Experiment Steps List - Fixed height with scrolling */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full p-3">
              <ExperimentStepsList
                nodes={nodes}
                selectedNode={selectedNode}
                onNodeSelect={handleNodeSelect}
                onNodeEdit={handleNodeEdit}
                onNodeDelete={handleNodeDeleted}
                onNodeMove={handleNodeMove}
              />
            </ScrollArea>
          </div>

          {/* Tree Info Blocks */}
          <div className="border-t border-border p-3 space-y-3 flex-shrink-0">
            {/* Tree Overview */}
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-foreground">Tree Overview</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={cn("text-xs px-1.5 py-0.5", getStatusColor(tree.status))}>
                    {tree.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <Badge className={cn("text-xs px-1.5 py-0.5", getCategoryColor(tree.category))}>
                    {tree.category}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Steps:</span>
                  <span className="text-foreground">{tree.node_count}</span>
                </div>
              </div>
            </div>

            {/* Node Type Breakdown */}
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-foreground">Step Types</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="text-foreground">{tree.node_types.data}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Software (Completed):</span>
                  <span className="text-foreground">{tree.node_types.software_completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Software (Development):</span>
                  <span className="text-foreground">{tree.node_types.software_development}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Results:</span>
                  <span className="text-foreground">{tree.node_types.results}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Protocols:</span>
                  <span className="text-foreground">{tree.node_types.protocols}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Final Outputs:</span>
                  <span className="text-foreground">{tree.node_types.final_outputs}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area - Node Details */}
        <div className="flex-1 flex flex-col">
          {/* Mobile Sidebar Toggle */}
          <div className="lg:hidden p-4 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTreeSidebarOpen(!treeSidebarOpen)}
            >
              <Bars3Icon className="h-4 w-4 mr-2" />
              {treeSidebarOpen ? "Hide Steps" : "Show Steps"}
            </Button>
          </div>

          {/* Node Content */}
          <div className="flex-1 p-6">
            {selectedNode ? (
              <div className="h-full flex flex-col">
                {/* Node Header */}
                <div className="mb-6">
                  <div className="flex items-center space-x-3 mb-2">
                    {getNodeIcon(selectedNode.node_type)}
                    <h1 className="text-2xl font-bold text-foreground">{selectedNode.name}</h1>
                    <Badge className={getNodeTypeColor(selectedNode.node_type)}>
                      {getNodeTypeLabel(selectedNode.node_type)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {selectedNode.description || "No description provided"}
                  </p>
                </div>

                {/* Node Content Tabs - Full width with new order */}
                <div className="flex-1 flex flex-col">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="attachments">Attachments</TabsTrigger>
                      <TabsTrigger value="links">Links</TabsTrigger>
                      <TabsTrigger value="metadata">Metadata</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="flex-1">
                      <Card className="h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <CardTitle>Content</CardTitle>
                            <CardDescription>
                              Main content for this step - descriptions, instructions, or detailed information.
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditContentOpen(true)}
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </CardHeader>
                        <CardContent className="flex-1">
                          {nodeContent ? (
                            <div className="h-full border rounded-md p-4">
                              <pre className="whitespace-pre-wrap text-sm">{nodeContent}</pre>
                            </div>
                          ) : (
                            <div className="h-full border border-dashed rounded-md p-6 text-center text-muted-foreground flex items-center justify-center">
                              <div>
                                <DocumentTextIcon className="h-8 w-8 mx-auto mb-2" />
                                <p>No content yet. Click Edit to add content.</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="attachments" className="flex-1">
                      <Card className="h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <CardTitle>Attachments</CardTitle>
                            <CardDescription>
                              Files, documents, and media associated with this step.
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditAttachmentsOpen(true)}
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </CardHeader>
                        <CardContent className="flex-1">
                          {nodeAttachments.length > 0 ? (
                            <div className="space-y-4">
                              {nodeAttachments.map((attachment) => (
                                <div key={attachment.id}>
                                  {isVideoUrl(attachment.url) ? (
                                    <VideoEmbed
                                      url={attachment.url}
                                      title={attachment.name}
                                      type={attachment.type}
                                    />
                                  ) : (
                                    <Card>
                                      <CardContent className="p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            <Badge variant="outline">{attachment.type}</Badge>
                                            <span className="text-sm font-medium">{attachment.name}</span>
                                          </div>
                                          <a
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 hover:underline"
                                          >
                                            View
                                          </a>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full border border-dashed rounded-md p-6 text-center text-muted-foreground flex items-center justify-center">
                              <div>
                                <DocumentArrowDownIcon className="h-8 w-8 mx-auto mb-2" />
                                <p>No attachments yet. Click Edit to add files.</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="links" className="flex-1">
                      <Card className="h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <CardTitle>Links</CardTitle>
                            <CardDescription>
                              External links, GitHub repositories, documentation, and related resources.
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditLinksOpen(true)}
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </CardHeader>
                        <CardContent className="flex-1">
                          {nodeLinks.length > 0 ? (
                            <div className="space-y-4">
                              {nodeLinks.map((link) => (
                                <div key={link.id}>
                                  {isVideoUrl(link.url) ? (
                                    <VideoEmbed
                                      url={link.url}
                                      title={link.name}
                                      type={link.type}
                                    />
                                  ) : (
                                    <Card>
                                      <CardContent className="p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            <LinkIcon className="h-4 w-4 text-muted-foreground" />
                                            <Badge variant="outline">{link.type}</Badge>
                                            <span className="text-sm font-medium">{link.name}</span>
                                          </div>
                                          <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 hover:underline"
                                          >
                                            View
                                          </a>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full border border-dashed rounded-md p-6 text-center text-muted-foreground flex items-center justify-center">
                              <div>
                                <LinkIcon className="h-8 w-8 mx-auto mb-2" />
                                <p>No links yet. Click Edit to add external resources.</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="metadata" className="flex-1">
                      <Card className="h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <CardTitle>Metadata</CardTitle>
                            <CardDescription>
                              Technical details, parameters, and configuration information.
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditMetadataOpen(true)}
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </CardHeader>
                        <CardContent className="flex-1">
                          {nodeMetadata.length > 0 ? (
                            <div className="space-y-2">
                              {nodeMetadata.map((field) => (
                                <Card key={field.id}>
                                  <CardContent className="p-3">
                                    <div className="flex items-center space-x-2">
                                      <Badge variant="outline">{field.type}</Badge>
                                      <span className="text-sm font-medium">{field.key}:</span>
                                      <span className="text-sm text-muted-foreground">{field.value}</span>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                              <div>
                                <h4 className="font-medium mb-2">Step Information</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Type:</span>
                                    <Badge className={getNodeTypeColor(selectedNode.node_type)}>
                                      {getNodeTypeLabel(selectedNode.node_type)}
                                    </Badge>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Position:</span>
                                    <span>{selectedNode.position || "Not set"}</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2">Timestamps</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Created:</span>
                                    <span>{new Date(selectedNode.created_at).toLocaleDateString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Updated:</span>
                                    <span>{new Date(selectedNode.updated_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <BeakerIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">No Step Selected</h2>
                  <p className="text-muted-foreground mb-6">
                    Click on a step in the list to view its details and content.
                  </p>
                  <Button onClick={() => setTreeSidebarOpen(true)} className="lg:hidden">
                    <Bars3Icon className="h-4 w-4 mr-2" />
                    Show Steps
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Dialogs */}
      <EditNodeForm
        node={nodeToEdit}
        open={editNodeOpen}
        onOpenChange={setEditNodeOpen}
        onNodeUpdated={handleNodeUpdated}
      />
      
      <EditContentForm
        node={selectedNode}
        open={editContentOpen}
        onOpenChange={setEditContentOpen}
        onContentUpdated={handleContentUpdated}
      />
      
      <EditAttachmentsForm
        node={selectedNode}
        open={editAttachmentsOpen}
        onOpenChange={setEditAttachmentsOpen}
        onAttachmentsUpdated={handleAttachmentsUpdated}
      />
      
      <EditLinksForm
        node={selectedNode}
        open={editLinksOpen}
        onOpenChange={setEditLinksOpen}
        onLinksUpdated={handleLinksUpdated}
      />
      
      <EditMetadataForm
        node={selectedNode}
        open={editMetadataOpen}
        onOpenChange={setEditMetadataOpen}
        onMetadataUpdated={handleMetadataUpdated}
      />
    </div>
  )
}
