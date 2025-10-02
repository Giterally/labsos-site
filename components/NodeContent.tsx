"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PlayIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  VideoCameraIcon,
  CircleStackIcon,
  CogIcon,
  ShareIcon,
  PlusIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PencilIcon,
  TagIcon,
  ClockIcon,
  UserIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline"

interface ExperimentNode {
  id: string
  title: string
  description: string
  node_type: string
  step_number: number
  order_index: number
  content: string
  metadata: any
  children: ExperimentNode[]
  attachments: Array<{
    id: string
    name: string
    attachment_type: string
    url?: string
    file_path?: string
    metadata: any
  }>
  tags: Array<{
    id: string
    name: string
    color: string
  }>
  created_at: string
  updated_at: string
}

interface NodeContentProps {
  node: ExperimentNode
  onNodeUpdate: (node: ExperimentNode) => void
}

export default function NodeContent({ node, onNodeUpdate }: NodeContentProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(node.content)
  const [editedTitle, setEditedTitle] = useState(node.title)
  const [editedDescription, setEditedDescription] = useState(node.description)

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "setup":
        return <CogIcon className="h-5 w-5" />
      case "calibration":
        return <CogIcon className="h-5 w-5" />
      case "run":
        return <PlayIcon className="h-5 w-5" />
      case "analysis":
        return <ChartBarIcon className="h-5 w-5" />
      case "post_processing":
        return <CogIcon className="h-5 w-5" />
      case "handover":
        return <ShareIcon className="h-5 w-5" />
      case "protocol":
        return <DocumentTextIcon className="h-5 w-5" />
      case "equipment":
        return <CogIcon className="h-5 w-5" />
      case "data":
        return <CircleStackIcon className="h-5 w-5" />
      case "code":
        return <CodeBracketIcon className="h-5 w-5" />
      case "video":
        return <VideoCameraIcon className="h-5 w-5" />
      default:
        return <DocumentTextIcon className="h-5 w-5" />
    }
  }

  const getNodeTypeColor = (nodeType: string) => {
    switch (nodeType) {
      case "setup":
        return "bg-blue-100 text-blue-800"
      case "calibration":
        return "bg-purple-100 text-purple-800"
      case "run":
        return "bg-green-100 text-green-800"
      case "analysis":
        return "bg-orange-100 text-orange-800"
      case "post_processing":
        return "bg-pink-100 text-pink-800"
      case "handover":
        return "bg-indigo-100 text-indigo-800"
      case "protocol":
        return "bg-gray-100 text-gray-800"
      case "equipment":
        return "bg-yellow-100 text-yellow-800"
      case "data":
        return "bg-cyan-100 text-cyan-800"
      case "code":
        return "bg-emerald-100 text-emerald-800"
      case "video":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const handleSave = () => {
    const updatedNode = {
      ...node,
      title: editedTitle,
      description: editedDescription,
      content: editedContent,
      updated_at: new Date().toISOString()
    }
    onNodeUpdate(updatedNode)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedTitle(node.title)
    setEditedDescription(node.description)
    setEditedContent(node.content)
    setIsEditing(false)
  }

  const renderAttachment = (attachment: any) => {
    switch (attachment.attachment_type) {
      case "video":
        return (
          <Card key={attachment.id} className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-base">
                <VideoCameraIcon className="h-4 w-4" />
                <span>{attachment.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attachment.url ? (
                <div className="aspect-video bg-black rounded-md flex items-center justify-center">
                  <video
                    src={attachment.url}
                    controls
                    className="max-w-full max-h-full"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div className="aspect-video bg-gray-100 rounded-md flex items-center justify-center">
                  <p className="text-muted-foreground">Video file: {attachment.name}</p>
                </div>
              )}
              {attachment.metadata?.transcript && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Transcript</h4>
                  <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-md max-h-32 overflow-y-auto">
                    {attachment.metadata.transcript}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )

      case "code_repo":
        return (
          <Card key={attachment.id} className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-base">
                <CodeBracketIcon className="h-4 w-4" />
                <span>{attachment.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={attachment.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {attachment.url}
                  </a>
                </div>
                {attachment.metadata?.language && (
                  <Badge variant="outline">{attachment.metadata.language}</Badge>
                )}
                {attachment.metadata?.description && (
                  <p className="text-sm text-muted-foreground">
                    {attachment.metadata.description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )

      case "dataset":
        return (
          <Card key={attachment.id} className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-base">
                <CircleStackIcon className="h-4 w-4" />
                <span>{attachment.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {attachment.url && (
                  <div className="flex items-center space-x-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={attachment.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Dataset
                    </a>
                  </div>
                )}
                {attachment.metadata?.size && (
                  <p className="text-sm text-muted-foreground">
                    Size: {attachment.metadata.size}
                  </p>
                )}
                {attachment.metadata?.description && (
                  <p className="text-sm text-muted-foreground">
                    {attachment.metadata.description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )

      default:
        return (
          <Card key={attachment.id} className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-base">
                <DocumentTextIcon className="h-4 w-4" />
                <span>{attachment.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm">
                  <EyeIcon className="h-4 w-4 mr-2" />
                  View
                </Button>
                <Button variant="outline" size="sm">
                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Node Header */}
      <div className="border-b border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getNodeIcon(node.node_type)}
            <div>
              {isEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-xl font-semibold"
                />
              ) : (
                <h1 className="text-xl font-semibold text-foreground">{node.title}</h1>
              )}
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={getNodeTypeColor(node.node_type)}>
                  {node.node_type.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Step {node.step_number}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <PencilIcon className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>
        
        {isEditing ? (
          <Textarea
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            placeholder="Node description..."
            className="mt-4"
          />
        ) : (
          node.description && (
            <p className="text-muted-foreground mt-2">{node.description}</p>
          )
        )}

        {/* Metadata */}
        <div className="flex items-center space-x-4 mt-4 text-sm text-muted-foreground">
          <div className="flex items-center space-x-1">
            <UserIcon className="h-4 w-4" />
            <span>Created by User</span>
          </div>
          <div className="flex items-center space-x-1">
            <ClockIcon className="h-4 w-4" />
            <span>Updated {new Date(node.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <Tabs defaultValue="content" className="h-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Node Content</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="Enter node content..."
                    className="min-h-[300px]"
                  />
                ) : (
                  <div className="prose max-w-none">
                    {node.content ? (
                      <div className="whitespace-pre-wrap">{node.content}</div>
                    ) : (
                      <p className="text-muted-foreground italic">No content available for this node.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attachments" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Attachments</h3>
                <Button size="sm">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Attachment
                </Button>
              </div>
              
              {node.attachments && node.attachments.length > 0 ? (
                node.attachments.map(attachment => renderAttachment(attachment))
              ) : (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground">No attachments for this node.</p>
                    <Button className="mt-4" size="sm">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add First Attachment
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="metadata" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Node Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Node Type</Label>
                    <p className="text-sm text-muted-foreground">{node.node_type}</p>
                  </div>
                  <div>
                    <Label>Step Number</Label>
                    <p className="text-sm text-muted-foreground">{node.step_number}</p>
                  </div>
                  <div>
                    <Label>Order Index</Label>
                    <p className="text-sm text-muted-foreground">{node.order_index}</p>
                  </div>
                  <div>
                    <Label>Created</Label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(node.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label>Updated</Label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(node.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Notes & Annotations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {node.tags && node.tags.length > 0 && (
                    <div>
                      <Label>Tags</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {node.tags.map(tag => (
                          <Badge key={tag.id} style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      placeholder="Add notes, troubleshooting tips, or other annotations..."
                      className="mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
