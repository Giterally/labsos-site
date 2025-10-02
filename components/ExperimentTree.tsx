"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  PlayIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  VideoCameraIcon,
  CircleStackIcon,
  CogIcon,
  ShareIcon,
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

interface ExperimentTreeProps {
  nodes: ExperimentNode[]
  selectedNode: ExperimentNode | null
  onNodeSelect: (node: ExperimentNode) => void
  searchQuery: string
  collapsed: boolean
}

export default function ExperimentTree({
  nodes,
  selectedNode,
  onNodeSelect,
  searchQuery,
  collapsed
}: ExperimentTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

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

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const filterNodes = (nodes: ExperimentNode[], query: string): ExperimentNode[] => {
    if (!query) return nodes
    
    return nodes.filter(node => {
      const matchesSearch = 
        node.title.toLowerCase().includes(query.toLowerCase()) ||
        node.description.toLowerCase().includes(query.toLowerCase()) ||
        node.content.toLowerCase().includes(query.toLowerCase())
      
      const childrenMatch = node.children ? filterNodes(node.children, query) : []
      
      return matchesSearch || childrenMatch.length > 0
    }).map(node => ({
      ...node,
      children: node.children ? filterNodes(node.children, query) : []
    }))
  }

  const renderNode = (node: ExperimentNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedNode?.id === node.id
    const hasChildren = node.children && node.children.length > 0
    const filteredChildren = hasChildren ? filterNodes(node.children, searchQuery) : []

    if (collapsed) {
      return (
        <div key={node.id} className="mb-1">
          <Button
            variant={isSelected ? "default" : "ghost"}
            size="sm"
            className="w-full justify-center p-2"
            onClick={() => onNodeSelect(node)}
            title={node.title}
          >
            {getNodeIcon(node.node_type)}
          </Button>
        </div>
      )
    }

    return (
      <div key={node.id} className="mb-1">
        <div
          className={cn(
            "flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors",
            isSelected 
              ? "bg-blue-50 border border-blue-200" 
              : "hover:bg-gray-50"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onNodeSelect(node)}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(node.id)
              }}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
            </Button>
          )}
          
          {!hasChildren && <div className="w-4" />}
          
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {getNodeIcon(node.node_type)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium truncate">{node.title}</span>
                <Badge className={cn("text-xs", getNodeTypeColor(node.node_type))}>
                  {node.node_type.replace('_', ' ')}
                </Badge>
              </div>
              {node.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {node.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4">
            {filteredChildren.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const filteredNodes = filterNodes(nodes, searchQuery)

  if (collapsed) {
    return (
      <div className="space-y-1">
        {nodes.map(node => renderNode(node))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {filteredNodes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No nodes found</p>
        </div>
      ) : (
        filteredNodes.map(node => renderNode(node))
      )}
    </div>
  )
}
