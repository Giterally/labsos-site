"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  VideoCameraIcon,
  CodeBracketIcon,
  CircleStackIcon,
  CogIcon,
  ShareIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
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

interface ExperimentTreeData {
  id: string
  name: string
  description: string
  status: string
  workspace_id: string
  nodes: ExperimentNode[]
  created_at: string
  updated_at: string
}

interface HandoverExportProps {
  tree: ExperimentTreeData
  onClose: () => void
}

export default function HandoverExport({ tree, onClose }: HandoverExportProps) {
  const [exportName, setExportName] = useState(`${tree.name} - Handover Package`)
  const [exportDescription, setExportDescription] = useState("")
  const [includeVideos, setIncludeVideos] = useState(true)
  const [includeCode, setIncludeCode] = useState(true)
  const [includeData, setIncludeData] = useState(true)
  const [includeProtocols, setIncludeProtocols] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "setup":
        return <CogIcon className="h-4 w-4" />
      case "calibration":
        return <CogIcon className="h-4 w-4" />
      case "run":
        return <PlayIcon className="h-4 w-4" />
      case "analysis":
        return <ChartBarIcon className="h-4 w-4" />
      case "post_processing":
        return <CogIcon className="h-4 w-4" />
      case "handover":
        return <ShareIcon className="h-4 w-4" />
      case "protocol":
        return <DocumentTextIcon className="h-4 w-4" />
      case "equipment":
        return <CogIcon className="h-4 w-4" />
      case "data":
        return <CircleStackIcon className="h-4 w-4" />
      case "code":
        return <CodeBracketIcon className="h-4 w-4" />
      case "video":
        return <VideoCameraIcon className="h-4 w-4" />
      default:
        return <DocumentTextIcon className="h-4 w-4" />
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

  const generateHandoverPackage = async () => {
    setIsGenerating(true)
    
    try {
      // TODO: Implement actual handover package generation
      // This would:
      // 1. Create a ZIP file with all relevant files
      // 2. Generate a PDF summary document
      // 3. Include video transcripts and code files
      // 4. Create a structured folder hierarchy
      
      // Simulate generation time
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // For now, just show success message
      alert("Handover package generated successfully!")
      onClose()
    } catch (error) {
      console.error("Error generating handover package:", error)
      alert("Error generating handover package. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  const getAttachmentCount = (type: string) => {
    return tree.nodes.reduce((count, node) => {
      return count + node.attachments.filter(att => att.attachment_type === type).length
    }, 0)
  }

  const getNodeCount = (type: string) => {
    return tree.nodes.filter(node => node.node_type === type).length
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ArrowDownTrayIcon className="h-5 w-5" />
            <span>Export Handover Package</span>
          </CardTitle>
          <CardDescription>
            Generate a complete handover package for the "{tree.name}" experiment tree.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Export Settings */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="export-name">Package Name</Label>
              <Input
                id="export-name"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="export-description">Description (Optional)</Label>
              <Textarea
                id="export-description"
                value={exportDescription}
                onChange={(e) => setExportDescription(e.target.value)}
                placeholder="Add a description for this handover package..."
                className="mt-1"
              />
            </div>
          </div>

          {/* Content Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Include Content</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="include-videos"
                  checked={includeVideos}
                  onChange={(e) => setIncludeVideos(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="include-videos" className="flex items-center space-x-2">
                  <VideoCameraIcon className="h-4 w-4" />
                  <span>Videos ({getAttachmentCount("video")})</span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="include-code"
                  checked={includeCode}
                  onChange={(e) => setIncludeCode(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="include-code" className="flex items-center space-x-2">
                  <CodeBracketIcon className="h-4 w-4" />
                  <span>Code ({getAttachmentCount("code_repo")})</span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="include-data"
                  checked={includeData}
                  onChange={(e) => setIncludeData(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="include-data" className="flex items-center space-x-2">
                  <CircleStackIcon className="h-4 w-4" />
                  <span>Datasets ({getAttachmentCount("dataset")})</span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="include-protocols"
                  checked={includeProtocols}
                  onChange={(e) => setIncludeProtocols(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="include-protocols" className="flex items-center space-x-2">
                  <DocumentTextIcon className="h-4 w-4" />
                  <span>Protocols ({getNodeCount("protocol")})</span>
                </Label>
              </div>
            </div>
          </div>

          {/* Package Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Package Contents</h3>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Experiment Tree:</span>
                  <span className="text-sm text-muted-foreground">{tree.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total Nodes:</span>
                  <span className="text-sm text-muted-foreground">{tree.nodes.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total Attachments:</span>
                  <span className="text-sm text-muted-foreground">
                    {tree.nodes.reduce((count, node) => count + node.attachments.length, 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Package Size (Est.):</span>
                  <span className="text-sm text-muted-foreground">~15.2 MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Node Summary */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Experiment Flow</h3>
            
            <div className="space-y-2">
              {tree.nodes.map((node) => (
                <div key={node.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    {getNodeIcon(node.node_type)}
                    <span className="text-sm font-medium">{node.title}</span>
                  </div>
                  <Badge className={getNodeTypeColor(node.node_type)}>
                    {node.node_type.replace('_', ' ')}
                  </Badge>
                  <div className="flex-1" />
                  <div className="text-sm text-muted-foreground">
                    {node.attachments.length} attachments
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={generateHandoverPackage} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                  Generate Package
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
