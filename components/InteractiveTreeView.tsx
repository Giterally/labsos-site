"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Bars3Icon,
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

interface InteractiveTreeViewProps {
  nodes: TreeNode[]
  selectedNode: TreeNode | null
  onNodeSelect: (node: TreeNode) => void
  onNodeEdit: (node: TreeNode) => void
  onNodeDelete: (node: TreeNode) => void
  onNodeMove: (nodeId: string, newParentId: string | null, newPosition: number) => void
  treeName: string
}

interface NodePosition {
  x: number
  y: number
}

export default function InteractiveTreeView({
  nodes,
  selectedNode,
  onNodeSelect,
  onNodeEdit,
  onNodeDelete,
  onNodeMove,
  treeName
}: InteractiveTreeViewProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Calculate tree layout with root node
  const calculateLayout = () => {
    const positions = new Map<string, NodePosition>()
    const nodeWidth = 200
    const nodeHeight = 80
    const horizontalSpacing = 250
    const verticalSpacing = 120

    // Add root node position (tree name)
    positions.set('root', { x: 0, y: 20 })

    const rootNodes = nodes.filter(node => !node.parent_id)
    
    const layoutNode = (node: TreeNode, x: number, y: number, level: number = 0) => {
      positions.set(node.id, { x, y })
      
      const children = nodes.filter(n => n.parent_id === node.id)
      if (children.length > 0) {
        const startX = x - ((children.length - 1) * horizontalSpacing) / 2
        children.forEach((child, index) => {
          const childX = startX + (index * horizontalSpacing)
          const childY = y + verticalSpacing
          layoutNode(child, childX, childY, level + 1)
        })
      }
    }

    // Layout root nodes (children of the tree root)
    rootNodes.forEach((node, index) => {
      const x = (index - (rootNodes.length - 1) / 2) * horizontalSpacing
      layoutNode(node, x, 120, 0)
    })

    setNodePositions(positions)
  }

  useEffect(() => {
    calculateLayout()
  }, [nodes])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    setDraggedNode(nodeId)
  }

  const handleNodeDragOver = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverNode(nodeId)
  }

  const handleNodeDrop = (e: React.MouseEvent, targetNodeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedNode && draggedNode !== targetNodeId) {
      const targetNode = nodes.find(n => n.id === targetNodeId)
      if (targetNode) {
        onNodeMove(draggedNode, targetNode.id, 0)
      }
    }
    
    setDraggedNode(null)
    setDragOverNode(null)
  }

  const renderConnection = (parentId: string, childId: string) => {
    const parentPos = nodePositions.get(parentId)
    const childPos = nodePositions.get(childId)
    
    if (!parentPos || !childPos) return null

    const parentX = parentPos.x + 100 // Center of parent node
    const parentY = parentPos.y + 40  // Bottom of parent node
    const childX = childPos.x + 100   // Center of child node
    const childY = childPos.y         // Top of child node

    return (
      <line
        key={`${parentId}-${childId}`}
        x1={parentX}
        y1={parentY}
        x2={childX}
        y2={childY}
        stroke="#e5e7eb"
        strokeWidth="2"
        markerEnd="url(#arrowhead)"
      />
    )
  }

  const renderRootNode = () => {
    const position = nodePositions.get('root')
    if (!position) return null

    return (
      <div
        key="root"
        className="absolute"
        style={{
          left: position.x,
          top: position.y,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0"
        }}
      >
        <div className="w-48 h-16 rounded-lg border-2 border-primary bg-primary/10 p-3 shadow-lg">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-sm font-bold text-primary">{treeName}</h3>
              <p className="text-xs text-primary/70">Root Node</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderNode = (node: TreeNode) => {
    const position = nodePositions.get(node.id)
    if (!position) return null

    const isSelected = selectedNode?.id === node.id
    const isDragging = draggedNode === node.id
    const isDragOver = dragOverNode === node.id

    return (
      <div
        key={node.id}
        className="absolute"
        style={{
          left: position.x,
          top: position.y,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0"
        }}
      >
        <div
          className={cn(
            "w-48 h-20 rounded-lg border-2 p-3 bg-white shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer",
            isSelected ? "border-primary bg-primary/5" : "border-gray-200",
            isDragging && "opacity-50",
            isDragOver && "ring-2 ring-primary ring-opacity-50",
            getNodeTypeColor(node.node_type)
          )}
          onClick={() => onNodeSelect(node)}
          onMouseDown={(e) => handleNodeDragStart(e, node.id)}
          onDragOver={(e) => handleNodeDragOver(e, node.id)}
          onDrop={(e) => handleNodeDrop(e, node.id)}
        >
          <div className="flex items-start justify-between h-full">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                {getNodeIcon(node.node_type)}
                <span className="text-sm font-medium truncate">{node.name}</span>
              </div>
              <Badge className={cn("text-xs", getNodeTypeColor(node.node_type))}>
                {getNodeTypeLabel(node.node_type)}
              </Badge>
              {node.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {node.description}
                </p>
              )}
            </div>
            <div className="flex flex-col space-y-1 ml-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onNodeEdit(node)
                }}
              >
                <PencilIcon className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation()
                  onNodeDelete(node)
                }}
              >
                <TrashIcon className="h-3 w-3" />
              </Button>
              <div className="h-5 w-5 flex items-center justify-center cursor-move">
                <Bars3Icon className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50">
      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
        >
          +
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
        >
          -
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          Reset
        </Button>
      </div>

      {/* Tree Visualization */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* SVG for connections */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0"
          }}
        >
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#e5e7eb"
              />
            </marker>
          </defs>

          {/* Render connections from root to root nodes */}
          {nodes
            .filter(node => !node.parent_id)
            .map(node => renderConnection('root', node.id))}

          {/* Render connections between nodes */}
          {nodes.map(node => {
            const children = nodes.filter(n => n.parent_id === node.id)
            return children.map(child => renderConnection(node.id, child.id))
          })}
        </svg>

        {/* Render root node */}
        {renderRootNode()}

        {/* Render all nodes */}
        {nodes.map(renderNode)}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-3 text-xs text-muted-foreground">
        <div className="space-y-1">
          <div>• Click and drag to pan</div>
          <div>• Scroll to zoom</div>
          <div>• Drag nodes to rearrange</div>
          <div>• Click nodes to select</div>
        </div>
      </div>
    </div>
  )
}
