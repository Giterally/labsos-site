// Updated with smaller box sizes
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  CircleStackIcon,
  CpuChipIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  DocumentTextIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline"

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

interface ExperimentStepsListProps {
  nodes: TreeNode[]
  selectedNode: TreeNode | null
  onNodeSelect: (node: TreeNode) => void
  onNodeEdit: (node: TreeNode) => void
  onNodeDelete: (node: TreeNode) => void
  onNodeMove: (nodeId: string, newPosition: number) => void
}

export default function ExperimentStepsList({
  nodes,
  selectedNode,
  onNodeSelect,
  onNodeEdit,
  onNodeDelete,
  onNodeMove
}: ExperimentStepsListProps) {
  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "data":
        return <CircleStackIcon className="h-3 w-3" />
      case "software_completed":
        return <CpuChipIcon className="h-3 w-3" />
      case "software_development":
        return <WrenchScrewdriverIcon className="h-3 w-3" />
      case "results":
        return <ChartBarIcon className="h-3 w-3" />
      case "protocols":
        return <DocumentTextIcon className="h-3 w-3" />
      case "final_outputs":
        return <DocumentArrowDownIcon className="h-3 w-3" />
      default:
        return <DocumentTextIcon className="h-3 w-3" />
    }
  }

  const getNodeTypeColor = (nodeType: string) => {
    switch (nodeType) {
      case "data":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "software_completed":
        return "bg-green-100 text-green-800 border-green-200"
      case "software_development":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "results":
        return "bg-purple-100 text-purple-800 border-purple-200"
      case "protocols":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "final_outputs":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
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

  // Sort nodes by position, then by creation date
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.position !== null && b.position !== null) {
      return a.position - b.position
    }
    if (a.position !== null) return -1
    if (b.position !== null) return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const moveNode = (nodeId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedNodes.findIndex(node => node.id === nodeId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= sortedNodes.length) return

    // Update positions for both nodes
    const currentNode = sortedNodes[currentIndex]
    const targetNode = sortedNodes[newIndex]
    
    onNodeMove(currentNode.id, newIndex)
    onNodeMove(targetNode.id, currentIndex)
  }

  return (
    <div className="space-y-1">
      {sortedNodes.length === 0 ? (
        <Card className="text-center py-4">
          <CardContent className="p-3">
            <DocumentTextIcon className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <h3 className="text-xs font-semibold text-foreground mb-1">No Steps Yet</h3>
            <p className="text-xs text-muted-foreground">
              Add your first experiment step.
            </p>
          </CardContent>
        </Card>
      ) : (
        sortedNodes.map((node, index) => {
          const isSelected = selectedNode?.id === node.id
          const canMoveUp = index > 0
          const canMoveDown = index < sortedNodes.length - 1

          return (
            <Card
              key={node.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-sm",
                isSelected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-muted/30"
              )}
              onClick={() => onNodeSelect(node)}
            >
              <CardContent className="px-1.5 py-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                    {/* Step Number */}
                    <div className="flex-shrink-0 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                      {index + 1}
                    </div>

                    {/* Node Icon */}
                    <div className={cn("flex-shrink-0 p-0.5 rounded border", getNodeTypeColor(node.node_type))}>
                      {getNodeIcon(node.node_type)}
                    </div>

                    {/* Node Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1 mb-0.5">
                        <h3 className="text-xs font-semibold text-foreground truncate">{node.name}</h3>
                        <Badge className={cn("text-xs px-1 py-0.5", getNodeTypeColor(node.node_type))}>
                          {getNodeTypeLabel(node.node_type)}
                        </Badge>
                      </div>
                      {node.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {node.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-0.5 ml-1">
                    {/* Move Up Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      disabled={!canMoveUp}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveNode(node.id, 'up')
                      }}
                      title="Move step up"
                    >
                      <ChevronUpIcon className="h-2.5 w-2.5" />
                    </Button>

                    {/* Move Down Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      disabled={!canMoveDown}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveNode(node.id, 'down')
                      }}
                      title="Move step down"
                    >
                      <ChevronDownIcon className="h-2.5 w-2.5" />
                    </Button>

                    {/* Edit Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onNodeEdit(node)
                      }}
                      title="Edit step"
                    >
                      <PencilIcon className="h-2.5 w-2.5" />
                    </Button>

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        onNodeDelete(node)
                      }}
                      title="Delete step"
                    >
                      <TrashIcon className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
