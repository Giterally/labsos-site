"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ArrowLeftIcon, PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, EllipsisVerticalIcon, LinkIcon } from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { useUser } from "@/lib/user-context"
import SearchTool from "@/components/SearchTool"
import AIChatSidebar from "@/components/AIChatSidebar"
import { Sparkles, ChevronLeft } from "lucide-react"
import { authFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// DEBUG: module load sanity check
try {
  console.debug('[TreePage] loaded. typeof authFetch =', typeof authFetch)
} catch {}


interface ExperimentNode {
  id: string
  title: string
  description: string
  type: string
  status: string
  position: number
  content: string
  attachments: Array<{
    id: string
    name: string
    file_type: string
    file_size: number
    file_url: string
    description: string
  }>
  links: Array<{
    id: string
    name: string
    url: string
    description: string
    link_type: string
  }>
  referenced_tree_ids: string[]
  referenced_trees: Array<{
    id: string
    name: string
    description: string
    status: string
    error?: 'not_found' | 'access_denied'
  }>
  dependencies?: Array<{
    id: string
    to_node_id: string
    to_node_name: string
    dependency_type: string
    evidence_text?: string
  }>
  metadata: {
    created: string
    updated: string
    type: string
    position: number
  }
}

export default function SimpleExperimentTreePage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string
  const treeId = params.treeId as string
  const { user: currentUser, loading: userLoading } = useUser()
  
  const [experimentNodes, setExperimentNodes] = useState<ExperimentNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Permission state
  const [isProjectOwner, setIsProjectOwner] = useState(false)
  const [isProjectMember, setIsProjectMember] = useState(false)
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [treeInfo, setTreeInfo] = useState<{name: string, description: string, status: string} | null>(null)
  const [projectInfo, setProjectInfo] = useState<{name: string, description: string} | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editing, setEditing] = useState(false)
  
  // Track which block to add nodes to
  const [targetBlockForNewNode, setTargetBlockForNewNode] = useState<string | null>(null)
  
  // Navigation context for back button
  const [navContext, setNavContext] = useState<{fromTreeId: string, fromProjectId: string, fromNodeId: string} | null>(null)
  
  // Nesting context for breadcrumb
  const [nestingContext, setNestingContext] = useState<{
    current: {id: string, name: string, description: string, status: string, project_id: string},
    parents: Array<{tree_id: string, tree_name: string, node_id: string, node_name: string}>,
    children: Array<{tree_id: string, tree_name: string, node_id: string, node_name: string}>
  } | null>(null)
  const [showHierarchyModal, setShowHierarchyModal] = useState(false)
  const [showReferenceModal, setShowReferenceModal] = useState(false)
  const [referenceModalNode, setReferenceModalNode] = useState<ExperimentNode | null>(null)
  const [showAIChatSidebar, setShowAIChatSidebar] = useState(false)
  const [isMac, setIsMac] = useState(false)

  // Detect Mac vs Windows for keyboard shortcut display
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(navigator.platform))
  }, [])

  // Handle Command+K (Mac) or Ctrl+K (Windows) to toggle AI chat sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowAIChatSidebar(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Tab editing states
  const [editingContent, setEditingContent] = useState(false)
  const [editingAttachments, setEditingAttachments] = useState(false)
  const [editingLinks, setEditingLinks] = useState(false)
  const [editingDependencies, setEditingDependencies] = useState(false)
  const [showAddDependencyModal, setShowAddDependencyModal] = useState(false)
  const [showEditDependencyModal, setShowEditDependencyModal] = useState(false)
  const [editingDependency, setEditingDependency] = useState<{ id: string; to_node_id: string; to_node_name: string; dependency_type: string } | null>(null)
  const [editingMetadata, setEditingMetadata] = useState(false)
  // Centralized auth error handler
  const handleAuthError = (err: unknown): boolean => {
    const code = (err as any)?.code
    if (code === 'AUTH_REQUIRED') {
      router.push('/login')
      return true
    }
    return false
  }
  
  // Temporary edit states
  const [tempContent, setTempContent] = useState('')
  const [tempAttachments, setTempAttachments] = useState<ExperimentNode['attachments']>([])
  const [tempLinks, setTempLinks] = useState<ExperimentNode['links']>([])
  const [tempMetadata, setTempMetadata] = useState<ExperimentNode['metadata'] | null>(null)
  
  // Modal states
  const [showAddAttachmentModal, setShowAddAttachmentModal] = useState(false)
  const [showEditAttachmentModal, setShowEditAttachmentModal] = useState(false)
  const [showAddLinkModal, setShowAddLinkModal] = useState(false)
  const [showEditLinkModal, setShowEditLinkModal] = useState(false)
  const [editingAttachment, setEditingAttachment] = useState<ExperimentNode['attachments'][0] | null>(null)
  const [editingLink, setEditingLink] = useState<ExperimentNode['links'][0] | null>(null)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoAttachment, setVideoAttachment] = useState<ExperimentNode['attachments'][0] | null>(null)
  
  // Collapsible blocks state
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set())
  
  // Block management state
  const [showBlockMenu, setShowBlockMenu] = useState<string | null>(null)
  const [showAddBlockForm, setShowAddBlockForm] = useState(false)
  const [showEditBlockForm, setShowEditBlockForm] = useState(false)
  const [editingBlockType, setEditingBlockType] = useState<string | null>(null)
  
  // Custom block names and ordering state
  const [blockNames, setBlockNames] = useState<Record<string, string>>({})
  const [customBlocks, setCustomBlocks] = useState<Array<{id: string, name: string, block_type: string, position: number}>>([])
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{type: 'block' | 'node', id: string, blockType?: string} | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{type: 'block' | 'node', id: string, blockType?: string} | null>(null)
  
  // Auto-scroll refs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [autoScrollDirection, setAutoScrollDirection] = useState<'up' | 'down' | null>(null)
  
  const selectedNode = experimentNodes.find(node => node.id === selectedNodeId) || null

  // Helper functions for collapsible blocks
  const toggleBlock = (blockType: string) => {
    setCollapsedBlocks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(blockType)) {
        newSet.delete(blockType)
      } else {
        newSet.add(blockType)
      }
      return newSet
    })
  }

  const getBlockTitle = (nodeType: string) => {
    // Check if this is a tree block
    const treeBlock = customBlocks.find(block => block.id === nodeType)
    if (treeBlock) {
      return treeBlock.name
    }
    
    // Use custom name if available, otherwise fall back to default
    if (blockNames[nodeType]) {
      return blockNames[nodeType]
    }
    
    // Regular node type titles
    const titleMap: Record<string, string> = {
      'protocol': 'Protocol Steps',
      'data_creation': 'Data Creation',
      'analysis': 'Analysis',
      'results': 'Results'
    }
    return titleMap[nodeType] || nodeType
  }

  const getBlockIcon = (nodeType: string) => {
    // Check if this is a tree block
    const treeBlock = customBlocks.find(block => block.id === nodeType)
    
    if (treeBlock) {
      // Use the actual block_type from the database
      switch (treeBlock.block_type) {
        case 'protocol': return '📋'
        case 'analysis': return '🔬'
        case 'data_creation': return '📊'
        case 'results': return '📈'
        case 'custom': return '📄'
        default: return '📄'
      }
    }
    
    // Regular node types (fallback for non-custom blocks)
    switch (nodeType) {
      case 'protocol': return '📋'
      case 'analysis': return '🔬'
      case 'data_creation': return '📊'
      case 'results': return '📈'
      default: return '📄'
    }
  }

  // Block management functions
  const handleBlockMenuToggle = (blockType: string) => {
    setShowBlockMenu(showBlockMenu === blockType ? null : blockType)
  }

  const handleEditBlock = (blockType: string) => {
    setEditingBlockType(blockType)
    setShowEditBlockForm(true)
    setShowBlockMenu(null)
  }

  const handleDeleteBlock = async (blockType: string) => {
    if (!confirm(`Are you sure you want to delete the "${getBlockTitle(blockType)}" block? This action cannot be undone.`)) {
      return
    }

    try {
      // Check if it's a custom block
      const isCustomBlock = customBlocks.some(block => block.id === blockType)
      
      if (isCustomBlock) {
        // Get the current session token
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('No authentication token available')
        }
        
        // Delete custom block from Supabase
        const response = await fetch(`/api/trees/${treeId}/blocks/${blockType}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to delete block')
        }

        // Refresh blocks from API instead of updating local state
        const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (blocksResponse.ok) {
          const blocksData = await blocksResponse.json()
          setCustomBlocks(blocksData.treeBlocks || [])
          
          // Set block names from tree blocks
          const names: Record<string, string> = {}
          blocksData.treeBlocks?.forEach((block: any) => {
            names[block.id] = block.name
          })
          setBlockNames(names)
          
        }
      } else {
        // For regular blocks, delete all nodes of this type
        const nodesToDelete = groupedNodes[blockType] || []
        for (const node of nodesToDelete) {
          await deleteNode(node.id)
        }
      }
      
      setShowBlockMenu(null)
    } catch (err) {
      console.error('Error deleting block:', err)
      alert('Failed to delete block')
    }
  }

  const handleAddNodeToBlock = (blockType: string) => {
    // Set the target block for the new node
    setTargetBlockForNewNode(blockType)
    setShowCreateForm(true)
    setShowBlockMenu(null)
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, type: 'block' | 'node', id: string, blockType?: string) => {
    setDraggedItem({ type, id, blockType })
    e.dataTransfer.effectAllowed = 'move'
    
    // Prevent event propagation for nodes to avoid triggering block drag
    if (type === 'node') {
      e.stopPropagation()
    }
  }

  const handleDragOver = (e: React.DragEvent, type: 'block' | 'node', id: string, blockType?: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverItem({ type, id, blockType })
    
    // Auto-scroll detection
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const rect = container.getBoundingClientRect()
      const mouseY = e.clientY
      const triggerZone = 30 // 30px from top/bottom
      
      const relativeY = mouseY - rect.top
      const containerHeight = rect.height
      
      if (relativeY <= triggerZone && container.scrollTop > 0) {
        // Near top, scroll up
        setAutoScrollDirection('up')
      } else if (relativeY >= containerHeight - triggerZone && container.scrollTop < container.scrollHeight - containerHeight) {
        // Near bottom, scroll down
        setAutoScrollDirection('down')
      } else {
        // Not in trigger zone, stop auto-scroll
        setAutoScrollDirection(null)
      }
    }
    
    // Prevent event propagation for nodes to avoid triggering block drag
    if (type === 'node') {
      e.stopPropagation()
    }
  }

  const handleDragLeave = (e: React.DragEvent, type?: 'block' | 'node') => {
    // Only clear if we're leaving the entire drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverItem(null)
    }
    
    // Prevent event propagation for nodes to avoid triggering block drag leave
    if (type === 'node') {
      e.stopPropagation()
    }
  }

  const handleDrop = async (e: React.DragEvent, targetType: 'block' | 'node', targetId: string, targetBlockType?: string) => {
    e.preventDefault()
    
    // Prevent event propagation for nodes to avoid triggering block drop
    if (targetType === 'node') {
      e.stopPropagation()
    }
    
    if (!draggedItem) return

    try {
      if (draggedItem.type === 'block' && targetType === 'block') {
        // Block reordering
        await handleBlockReorder(draggedItem.id, targetId)
      } else if (draggedItem.type === 'node' && targetType === 'node') {
        // Node reordering within same block
        if (draggedItem.blockType === targetBlockType) {
          await handleNodeReorder(draggedItem.id, targetId, draggedItem.blockType!)
        } else {
          // Move node to different block
          await handleNodeMoveToBlock(draggedItem.id, targetBlockType!)
        }
      } else if (draggedItem.type === 'node' && targetType === 'block') {
        // Move node to different block
        await handleNodeMoveToBlock(draggedItem.id, targetId)
      }
    } catch (error) {
      console.error('Error handling drop:', error)
    }

    setDraggedItem(null)
    setDragOverItem(null)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverItem(null)
    setAutoScrollDirection(null)
  }

  // Block reordering (unified system)
  const handleBlockReorder = async (draggedBlockId: string, targetBlockId: string) => {
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }

      // Get current block order from the database
      const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!blocksResponse.ok) {
        throw new Error('Failed to fetch current block order')
      }

      const blocksData = await blocksResponse.json()
      const currentBlocks = blocksData.treeBlocks || []
      
      // Find the dragged and target blocks
      const draggedBlock = currentBlocks.find((block: any) => block.id === draggedBlockId)
      const targetBlock = currentBlocks.find((block: any) => block.id === targetBlockId)
      
      if (!draggedBlock || !targetBlock) {
        throw new Error('Could not find blocks to reorder')
      }

      // Create new order by updating positions
      const newBlocks = currentBlocks.map((block: any) => {
        if (block.id === draggedBlockId) {
          return { ...block, position: targetBlock.position }
        } else if (block.id === targetBlockId) {
          return { ...block, position: draggedBlock.position }
        }
        return block
      })

      // Update block positions in the database
      const updatePromises = newBlocks.map((block: any) => 
        fetch(`/api/trees/${treeId}/blocks/${block.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            position: block.position
          }),
        })
      )

      const results = await Promise.all(updatePromises)
      const failedUpdates = results.filter(response => !response.ok)
      
      if (failedUpdates.length > 0) {
        throw new Error('Failed to update some block positions')
      }

      // Refresh the blocks data
      const refreshResponse = await fetch(`/api/trees/${treeId}/blocks`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        setCustomBlocks(refreshData.treeBlocks || [])
      }

    } catch (err) {
      console.error('Error updating block order:', err)
      alert(`Failed to update block order: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }



  // Helper function to update multiple node positions
  const updateNodePositions = async (positionUpdates: {nodeId: string, position: number}[]) => {
    try {
      console.log('updateNodePositions called with:', positionUpdates)
      
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      // Use batch update API for better performance and atomicity
      const response = await authFetch(`/api/trees/${treeId}/nodes/batch-update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ positionUpdates }),
        requireAuth: true
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Batch update failed:', errorData)
        throw new Error(errorData.error || 'Failed to update node positions')
      }
      
      const result = await response.json()
      console.log('Batch update successful:', result)
    } catch (error) {
      if (handleAuthError(error)) return
      console.error('Error updating node positions:', error)
      alert('Failed to update node positions')
    }
  }

  // Node reordering within same block
  const handleNodeReorder = async (draggedNodeId: string, targetNodeId: string, blockType: string) => {
    try {
      // Get all nodes in this block, sorted by position
      const nodesInBlock = experimentNodes
        .filter(n => n.type === blockType)
        .sort((a, b) => a.position - b.position)
      
      const draggedNode = nodesInBlock.find(n => n.id === draggedNodeId)
      const targetNode = nodesInBlock.find(n => n.id === targetNodeId)
      
      if (!draggedNode || !targetNode) return
      
      const draggedIndex = nodesInBlock.findIndex(n => n.id === draggedNodeId)
      const targetIndex = nodesInBlock.findIndex(n => n.id === targetNodeId)
      
      if (draggedIndex === -1 || targetIndex === -1) return
      
      // Create new order by moving the dragged node to target position
      const newOrder = [...nodesInBlock]
      const [movedNode] = newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, movedNode)
      
      // Calculate new positions (1-indexed)
      const positionUpdates = newOrder.map((node, index) => ({
        nodeId: node.id,
        position: index + 1
      }))
      
      // Update positions in database
      await updateNodePositions(positionUpdates)
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => {
        const update = positionUpdates.find(u => u.nodeId === node.id)
        return update ? { ...node, position: update.position } : node
      }))
      
    } catch (error) {
      console.error('Error reordering nodes:', error)
    }
  }

  // Move node to different block
  const handleNodeMoveToBlock = async (nodeId: string, targetBlockType: string) => {
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          node_type: targetBlockType
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to move node')
      }
      
      // Refresh nodes to get updated data
      const nodesResponse = await fetch(`/api/trees/${treeId}/nodes`)
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json()
        setExperimentNodes(nodesData.nodes)
        
        // Node order is now handled by position field, no need for nodeOrder state
      }
    } catch (err) {
      console.error('Error moving node:', err)
    }
  }

  // Check if a block should be highlighted (contains selected node)
  const isBlockHighlighted = (blockType: string) => {
    if (!selectedNode) return false
    return selectedNode.type === blockType
  }

  // Group nodes by type and include custom blocks
  const groupedNodes = useMemo(() => {
    // Unified system: group nodes by block_id (stored in node.type)
    const grouped = experimentNodes.reduce((acc, node) => {
      if (!acc[node.type]) {
        acc[node.type] = []
      }
      acc[node.type].push(node)
      return acc
    }, {} as Record<string, ExperimentNode[]>)

    // Add all tree blocks to the grouped nodes (even if they have no nodes)
    customBlocks.forEach(block => {
      if (!grouped[block.id]) {
        grouped[block.id] = []
      }
    })

    // Also add regular node types for backward compatibility
    const regularTypes = ['protocol', 'data_creation', 'analysis', 'results']
    regularTypes.forEach(type => {
      if (!grouped[type]) {
        grouped[type] = []
      }
    })

    return grouped
  }, [experimentNodes, customBlocks])

  // Get all block types in the desired order (unified system)
  const allBlockTypes = useMemo(() => {
    if (customBlocks.length > 0) {
      // If we have tree_blocks, use them (sorted by position)
      return customBlocks
        .sort((a, b) => a.position - b.position)
        .map(block => block.id)
    } else {
      // Fallback: show regular node types for trees without tree_blocks
      const regularTypes = ['protocol', 'data_creation', 'analysis', 'results']
      return regularTypes.filter(type => 
        groupedNodes[type] && groupedNodes[type].length > 0
      )
    }
  }, [customBlocks, groupedNodes])

  // Permission check for editing
  const hasEditPermission = isProjectOwner || isProjectMember
  

  // Check project permissions
  useEffect(() => {
    const checkPermissions = async () => {
      if (!currentUser) {
        setPermissionsLoading(false)
        return
      }

      try {
        setPermissionsLoading(true)
        const response = await fetch(`/api/projects/${projectId}/team`, {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setIsProjectOwner(data.isOwner || false)
          setIsProjectMember(data.isTeamMember || false)
        }
      } catch (err) {
        console.error('Error checking permissions:', err)
      } finally {
        setPermissionsLoading(false)
      }
    }

    if (projectId && currentUser) {
      checkPermissions()
    } else {
      setPermissionsLoading(false)
    }
  }, [projectId, currentUser])

  // Fetch project information
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        // Get session for API call if user is authenticated
        let headers: HeadersInit = {}
        if (currentUser) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
        }

        const response = await fetch(`/api/projects/${projectId}`, {
          headers
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.message || errorData.error || 'Failed to fetch project information'
          console.error('API Error:', response.status, errorMessage, errorData)
          throw new Error(errorMessage)
        }
        const data = await response.json()
        setProjectInfo({
          name: data.project.name,
          description: data.project.description
        })
      } catch (error) {
        console.error('Error fetching project info:', error)
        // Don't set error state for project info, just log it
      }
    }

    if (projectId && !userLoading) {
      fetchProjectInfo()
    }
  }, [projectId, currentUser, userLoading])

  // Fetch tree information
  useEffect(() => {
    const fetchTreeInfo = async () => {
      try {
        // Get session for API call if user is authenticated
        let headers: HeadersInit = {}
        if (currentUser) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
        }

        const response = await fetch(`/api/trees/${treeId}`, {
          headers
        })
        if (!response.ok) {
          throw new Error('Failed to fetch tree information')
        }
        const data = await response.json()
        setTreeInfo({
          name: data.tree.name,
          description: data.tree.description,
          status: data.tree.status
        })
      } catch (err) {
        console.error('Error fetching tree info:', err)
      }
    }

    if (!userLoading) {
      fetchTreeInfo()
    }
  }, [treeId, currentUser, userLoading])

  // Check for navigation context from sessionStorage
  useEffect(() => {
    const contextStr = sessionStorage.getItem('tree_nav_context')
    if (contextStr) {
      try {
        const context = JSON.parse(contextStr)
        setNavContext(context)
        
        // Scroll to the node after a short delay to ensure DOM is rendered
        setTimeout(() => {
          const nodeElement = document.getElementById(`node-${context.fromNodeId}`)
          if (nodeElement) {
            nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 500)
      } catch (err) {
        console.error('Error parsing navigation context:', err)
      }
    }
  }, [treeId])

  // Function to handle back navigation
  const handleBackNavigation = () => {
    if (navContext) {
      router.push(`/project/${navContext.fromProjectId}/trees/${navContext.fromTreeId}`)
      // Clear the context as we're going back
      sessionStorage.removeItem('tree_nav_context')
    }
  }

  // Fetch nesting context for breadcrumb
  useEffect(() => {
    const fetchNestingContext = async () => {
      try {
        let headers: HeadersInit = {}
        if (currentUser) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
        }

        const response = await fetch(`/api/trees/${treeId}/nesting-context`, {
          headers
        })
        
        if (response.ok) {
          const data = await response.json()
          setNestingContext(data)
        }
      } catch (err) {
        console.error('Error fetching nesting context:', err)
      }
    }

    if (!userLoading) {
      fetchNestingContext()
    }
  }, [treeId, currentUser, userLoading])

  // Fetch blocks and ordering
  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        // Get session for API call if user is authenticated
        let headers: HeadersInit = {}
        if (currentUser) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
        }

        const response = await fetch(`/api/trees/${treeId}/blocks`, {
          headers
        })
        if (!response.ok) {
          throw new Error('Failed to fetch blocks')
        }
        const data = await response.json()
        
        // Use unified tree_blocks system
        setCustomBlocks(data.treeBlocks || [])
        
        // Set block names from tree blocks
        const names: Record<string, string> = {}
        data.treeBlocks?.forEach((block: any) => {
          names[block.id] = block.name
        })
        setBlockNames(names)
      } catch (err) {
        console.error('Error fetching blocks:', err)
      }
    }

    if (!userLoading) {
      fetchBlocks()
    }
  }, [treeId, currentUser, userLoading])

  // Fetch nodes from Supabase
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        setLoading(true)
        
        // Get session for API call if user is authenticated
        let headers: HeadersInit = {}
        if (currentUser) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
        }

        const response = await fetch(`/api/trees/${treeId}/nodes`, {
          headers
        })
        if (!response.ok) {
          throw new Error('Failed to fetch nodes')
        }
        const data = await response.json()
        setExperimentNodes(data.nodes)
        
        // Node order is now handled by position field, no need for nodeOrder state
        
        // Select the first node if available
        if (data.nodes.length > 0) {
          setSelectedNodeId(data.nodes[0].id)
        }
      } catch (err) {
        console.error('Error fetching nodes:', err)
        setError('Failed to load experiment tree nodes')
      } finally {
        setLoading(false)
      }
    }

    if (!userLoading) {
      fetchNodes()
    }
  }, [treeId, currentUser, userLoading])

  // Auto-scroll during drag and drop
  useEffect(() => {
    if (!draggedItem || !scrollContainerRef.current || !autoScrollDirection) return

    let animationFrameId: number
    const scrollSpeed = 8 // Medium scroll speed

    const handleAutoScroll = () => {
      if (!scrollContainerRef.current || !autoScrollDirection) return

      const container = scrollContainerRef.current
      const scrollTop = container.scrollTop
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight

      if (autoScrollDirection === 'up' && scrollTop > 0) {
        // Scroll up
        container.scrollTop = Math.max(0, scrollTop - scrollSpeed)
        animationFrameId = requestAnimationFrame(handleAutoScroll)
      } else if (autoScrollDirection === 'down' && scrollTop < scrollHeight - clientHeight) {
        // Scroll down
        container.scrollTop = Math.min(scrollHeight - clientHeight, scrollTop + scrollSpeed)
        animationFrameId = requestAnimationFrame(handleAutoScroll)
      }
    }

    // Start auto-scroll monitoring
    animationFrameId = requestAnimationFrame(handleAutoScroll)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [draggedItem, autoScrollDirection])

  // Create new node
  const createNode = async (name: string, description: string, nodeType: string, referencedTreeIds: string[] = []) => {
    try {
      setCreating(true)
      
      // Use target block if specified, otherwise use the provided nodeType
      const actualNodeType = targetBlockForNewNode || nodeType
      
      // Calculate next position for this specific block
      const nodesInBlock = experimentNodes.filter(n => n.type === actualNodeType)
      const nextPosition = nodesInBlock.length > 0 
        ? Math.max(...nodesInBlock.map(n => n.position)) + 1 
        : 1
      
      const requestData = {
        name,
        description,
        node_type: actualNodeType,
        position: nextPosition,
        content: '', // Empty content initially
        referenced_tree_ids: referencedTreeIds
      }
      
      console.log('Creating node with data:', requestData)
      console.log('Tree ID:', treeId)
      
      // Get the current session token and include it for authenticated creation
      console.debug('[createNode] typeof authFetch before call =', typeof authFetch)
      const response = await authFetch(`/api/trees/${treeId}/nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        requireAuth: true
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details ? 
          `${errorData.error}: ${errorData.details}` : 
          errorData.error || 'Failed to create node'
        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      // Transform the new node to match our interface
      const newNode: ExperimentNode = {
        id: data.node.id,
        title: data.node.name,
        description: data.node.description,
        type: data.node.node_type,
        status: 'draft',
        position: data.node.position,
        content: '',
        attachments: [],
        links: [],
        metadata: {
          created: data.node.created_at,
          updated: data.node.updated_at,
          type: data.node.node_type,
          position: data.node.position
        }
      }
      
      // Refresh nodes from API to get the complete data
      const nodesResponse = await authFetch(`/api/trees/${treeId}/nodes`, {
        requireAuth: true
      })
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json()
        setExperimentNodes(nodesData.nodes)
        
        // Initialize node order for each block type
        // Node order is now handled by position field, no need for nodeOrder state
        
        // Select the new node
        setSelectedNodeId(data.node.id)
      }
      
      setShowCreateForm(false)
      setTargetBlockForNewNode(null) // Reset target block
    } catch (err) {
      if (handleAuthError(err)) return
      console.error('[createNode] error:', err)
      alert('Failed to create node: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  // Edit node
  const editNode = async (nodeId: string, name: string, description: string, nodeType: string, referencedTreeIds: string[] = []) => {
    try {
      setEditing(true)
      
      // Get the current session token
      const response = await authFetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          node_type: nodeType,
          referenced_tree_ids: referencedTreeIds
        }),
        requireAuth: true
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update node')
      }
      
      // Refresh nodes from API to get complete updated data including referenced_tree metadata
      const nodesResponse = await authFetch(`/api/trees/${treeId}/nodes`, {
        requireAuth: true
      })
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json()
        setExperimentNodes(nodesData.nodes)
        
        // Keep the same node selected
        setSelectedNodeId(nodeId)
      }
      
      setShowEditForm(false)
    } catch (err) {
      if (handleAuthError(err)) return
      console.error('Error updating node:', err)
      alert(err instanceof Error ? err.message : 'Failed to update node')
    } finally {
      setEditing(false)
    }
  }

  // Content editing functions
  const startEditingContent = () => {
    if (selectedNode) {
      setTempContent(selectedNode.content)
      setEditingContent(true)
    }
  }

  const cancelEditingContent = () => {
    setEditingContent(false)
    setTempContent('')
  }

  const saveContent = async () => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await authFetch(`/api/trees/${treeId}/nodes/${selectedNode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: selectedNode.title,
          description: selectedNode.description,
          node_type: selectedNode.type,
          content: tempContent,
          status: 'draft'
        }),
        requireAuth: true
      })
      
      if (!response.ok) {
        throw new Error('Failed to save content')
      }
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { ...node, content: tempContent }
          : node
      ))
      
      setEditingContent(false)
      setTempContent('')
    } catch (err) {
      if (handleAuthError(err)) return
      console.error('Error saving content:', err)
      alert('Failed to save content')
    }
  }

  // Attachment management functions
  const addAttachment = async (name: string, fileType: string, fileSize: number, fileUrl: string, description: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name,
          file_type: fileType,
          file_size: fileSize,
          file_url: fileUrl,
          description
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to add attachment')
      }
      
      const { attachment } = await response.json()
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { ...node, attachments: [...node.attachments, attachment] }
          : node
      ))
    } catch (err) {
      console.error('Error adding attachment:', err)
      alert('Failed to add attachment')
    }
  }

  const updateAttachment = async (attachmentId: string, name: string, fileType: string, fileSize: number, fileUrl: string, description: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments/${attachmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name,
          file_type: fileType,
          file_size: fileSize,
          file_url: fileUrl,
          description
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update attachment')
      }
      
      const { attachment } = await response.json()
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              attachments: node.attachments.map(att => 
                att.id === attachmentId ? attachment : att
              )
            }
          : node
      ))
    } catch (err) {
      console.error('Error updating attachment:', err)
      alert('Failed to update attachment')
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete attachment')
      }
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              attachments: node.attachments.filter(att => att.id !== attachmentId)
            }
          : node
      ))
    } catch (err) {
      console.error('Error deleting attachment:', err)
      alert('Failed to delete attachment')
    }
  }

  // Link management functions
  const addLink = async (name: string, url: string, description: string, linkType: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name,
          url,
          description,
          link_type: linkType
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to add link')
      }
      
      const { link } = await response.json()
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { ...node, links: [...node.links, link] }
          : node
      ))
    } catch (err) {
      console.error('Error adding link:', err)
      alert('Failed to add link')
    }
  }

  const updateLink = async (linkId: string, name: string, url: string, description: string, linkType: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links/${linkId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name,
          url,
          description,
          link_type: linkType
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update link')
      }
      
      const { link } = await response.json()
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              links: node.links.map(l => 
                l.id === linkId ? link : l
              )
            }
          : node
      ))
    } catch (err) {
      console.error('Error updating link:', err)
      alert('Failed to update link')
    }
  }

  const deleteLink = async (linkId: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links/${linkId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete link')
      }
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              links: node.links.filter(l => l.id !== linkId)
            }
          : node
      ))
    } catch (err) {
      console.error('Error deleting link:', err)
      alert('Failed to delete link')
    }
  }

  // Dependency management functions
  const addDependency = async (to_node_id: string, dependency_type: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/dependencies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          to_node_id,
          dependency_type
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to add dependency')
      }
      
      const { dependency } = await response.json()
      
      // Update local state - ensure to_node_name is resolved from current nodes
      setExperimentNodes(prev => {
        const targetNode = prev.find(n => n.id === dependency.to_node_id)
        const resolvedDependency = {
          ...dependency,
          to_node_name: targetNode?.title || dependency.to_node_name || 'Unknown node'
        }
        
        return prev.map(node => 
          node.id === selectedNode.id 
            ? { ...node, dependencies: [...(node.dependencies || []), resolvedDependency] }
            : node
        )
      })
      
      setShowAddDependencyModal(false)
    } catch (err) {
      console.error('Error adding dependency:', err)
      alert(err instanceof Error ? err.message : 'Failed to add dependency')
    }
  }

  const updateDependency = async (dependencyId: string, to_node_id: string, dependency_type: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/dependencies/${dependencyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          to_node_id,
          dependency_type
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update dependency')
      }
      
      const { dependency } = await response.json()
      
      // Update local state - ensure to_node_name is resolved from current nodes
      setExperimentNodes(prev => {
        const targetNode = prev.find(n => n.id === dependency.to_node_id)
        const resolvedDependency = {
          ...dependency,
          to_node_name: targetNode?.title || dependency.to_node_name || 'Unknown node'
        }
        
        return prev.map(node => 
          node.id === selectedNode.id 
            ? { 
                ...node, 
                dependencies: (node.dependencies || []).map(dep => 
                  dep.id === dependencyId ? resolvedDependency : dep
                )
              }
            : node
        )
      })
      
      setShowEditDependencyModal(false)
      setEditingDependency(null)
    } catch (err) {
      console.error('Error updating dependency:', err)
      alert(err instanceof Error ? err.message : 'Failed to update dependency')
    }
  }

  const deleteDependency = async (dependencyId: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/dependencies/${dependencyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete dependency')
      }
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              dependencies: (node.dependencies || []).filter(dep => dep.id !== dependencyId)
            }
          : node
      ))
    } catch (err) {
      console.error('Error deleting dependency:', err)
      alert('Failed to delete dependency')
    }
  }

  // Metadata editing functions
  const startEditingMetadata = () => {
    if (selectedNode) {
      setTempMetadata(selectedNode.metadata)
      setEditingMetadata(true)
    }
  }

  const cancelEditingMetadata = () => {
    setEditingMetadata(false)
    setTempMetadata(null)
  }

  const saveMetadata = async (newType: string, newPosition: number, newStatus: string) => {
    if (!selectedNode) return
    
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }
      
      // Check if position changed and handle repositioning
      const positionChanged = selectedNode.position !== newPosition
      const typeChanged = selectedNode.type !== newType
      
      // Initialize positionUpdates array
      let positionUpdates: {nodeId: string, position: number}[] = []
      
      if (positionChanged || typeChanged) {
        // Get all nodes in the current block (before type change)
        const currentBlockNodes = experimentNodes
          .filter(n => n.type === selectedNode.type)
          .sort((a, b) => a.position - b.position)
        
        // If type changed, also get nodes in the new block
        const targetBlockNodes = typeChanged 
          ? experimentNodes.filter(n => n.type === newType).sort((a, b) => a.position - b.position)
          : currentBlockNodes
        
        if (typeChanged) {
          // Moving to different block - remove from old block and add to new block
          
          // Re-index old block (remove gaps)
          currentBlockNodes
            .filter(n => n.id !== selectedNode.id)
            .forEach((node, index) => {
              positionUpdates.push({ nodeId: node.id, position: index + 1 })
            })
          
          // Add to new block at specified position
          const newBlockWithNode = [...targetBlockNodes]
          newBlockWithNode.splice(Math.max(0, newPosition - 1), 0, selectedNode)
          
          // Re-index new block
          newBlockWithNode.forEach((node, index) => {
            positionUpdates.push({ nodeId: node.id, position: index + 1 })
          })
        } else {
          // Same block, just repositioning
          const nodesWithoutSelected = currentBlockNodes.filter(n => n.id !== selectedNode.id)
          const newOrder = [...nodesWithoutSelected]
          newOrder.splice(Math.max(0, newPosition - 1), 0, selectedNode)
          
          // Re-index all nodes in the block
          newOrder.forEach((node, index) => {
            positionUpdates.push({ nodeId: node.id, position: index + 1 })
          })
        }
        
        // Update all positions in database
        console.log('Position updates:', positionUpdates)
        try {
          await updateNodePositions(positionUpdates)
          console.log('Successfully updated positions in database')
        } catch (error) {
          console.error('Failed to update positions:', error)
          // Still update local state even if DB update fails
        }
      }
      
      // Update the main node data
      const response = await authFetch(`/api/trees/${treeId}/nodes/${selectedNode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: selectedNode.title,
          description: selectedNode.description,
          node_type: newType,
          position: newPosition,
          content: selectedNode.content,
          status: newStatus
        }),
        requireAuth: true
      })
      
      if (!response.ok) {
        throw new Error('Failed to save metadata')
      }
      
      // Update local state
      setExperimentNodes(prev => {
        const updated = prev.map(node => {
          const positionUpdate = positionChanged || typeChanged 
            ? positionUpdates.find(u => u.nodeId === node.id)
            : null
          
          if (node.id === selectedNode.id) {
            return {
              ...node,
              type: newType,
              status: newStatus,
              position: newPosition,
              metadata: {
                ...node.metadata,
                type: newType,
                position: newPosition,
                updated: new Date().toISOString()
              }
            }
          } else if (positionUpdate) {
            console.log(`Updating node ${node.id} position from ${node.position} to ${positionUpdate.position}`)
            return { ...node, position: positionUpdate.position }
          }
          return node
        })
        
        console.log('Updated nodes:', updated.map(n => ({ id: n.id, position: n.position })))
        return updated
      })
      
      setEditingMetadata(false)
      setTempMetadata(null)
    } catch (err) {
      console.error('Error saving metadata:', err)
      alert('Failed to save metadata')
    }
  }

  // Delete node
  const deleteNode = async (nodeId: string) => {
    if (!confirm('Are you sure you want to delete this node? This action cannot be undone.')) {
      return
    }

    try {
      // Get the current session token
      const response = await authFetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'DELETE',
        requireAuth: true
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete node')
      }

      setExperimentNodes(prev => prev.filter(node => node.id !== nodeId))
      
      // If the deleted node was selected, clear the selection
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
      }
    } catch (err) {
      if (handleAuthError(err)) return
      console.error('Error deleting node:', err)
      alert('Failed to delete node: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading experiment tree...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={() => router.push(`/project/${projectId}`)} className="mt-4">
              Back to {projectInfo?.name || 'Project'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 pt-20">
        {/* Header with Back Button and Search */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {navContext ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackNavigation}
                className="flex items-center space-x-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span>Back to previous tree</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/project/${projectId}`)}
                className="flex items-center space-x-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span>Back to {projectInfo?.name || 'Project'}</span>
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search Tool */}
            <SearchTool 
              treeId={treeId}
              projectId={projectId}
              onAIChatOpen={() => setShowAIChatSidebar(true)}
              onNodeSelect={(nodeId, sectionId) => {
                setSelectedNodeId(nodeId)
                
                // If there's a specific section, switch to that tab
                if (sectionId) {
                  // Map section IDs to tab values
                  const sectionToTabMap: Record<string, string> = {
                    'content': 'content',
                    'attachments': 'attachments', 
                    'links': 'links',
                    'metadata': 'metadata'
                  }
                  
                  const tabValue = sectionToTabMap[sectionId]
                  if (tabValue) {
                    // Find the tab trigger and click it
                    setTimeout(() => {
                      const tabTrigger = document.querySelector(`[data-state="inactive"][value="${tabValue}"]`) as HTMLElement
                      if (tabTrigger) {
                        tabTrigger.click()
                      }
                    }, 200)
                  }
                }
                
                // Scroll to the selected node if it's visible
                setTimeout(() => {
                  const element = document.getElementById(`node-${nodeId}`)
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    
                    // If there's a specific section, try to scroll to it
                    if (sectionId) {
                      setTimeout(() => {
                        const sectionElement = document.getElementById(sectionId)
                        if (sectionElement) {
                          sectionElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          // Highlight the section briefly
                          sectionElement.classList.add('bg-yellow-100', 'transition-colors', 'duration-1000')
                          setTimeout(() => {
                            sectionElement.classList.remove('bg-yellow-100')
                          }, 2000)
                        }
                      }, 500)
                    }
                  }
                }, 100)
              }}
            />
          </div>
        </div>

        {/* Nesting Context Breadcrumb */}
        {nestingContext && (nestingContext.parents.length > 0 || nestingContext.children.length > 0) && (
          <div className="mb-4">
            <Card className="border-border bg-card">
              <CardContent className="py-1.5 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm">
                    {nestingContext.parents.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <span className="text-muted-foreground">
                          {nestingContext.parents.length} parent tree{nestingContext.parents.length > 1 ? 's' : ''}
                        </span>
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Current</Badge>
                      <span className="font-medium">{nestingContext.current.name}</span>
                    </div>
                    {nestingContext.children.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {nestingContext.children.length} nested tree{nestingContext.children.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHierarchyModal(true)}
                    className="text-xs"
                  >
                    View Hierarchy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tree Information Header */}
        {treeInfo && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-2">{treeInfo.name}</CardTitle>
                    {treeInfo.description && (
                      <CardDescription className="text-base mb-4">
                        {treeInfo.description}
                      </CardDescription>
                    )}
                    <div className="flex items-center space-x-4">
                      <Badge variant="outline" className={
                        treeInfo.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        treeInfo.status === 'completed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        treeInfo.status === 'draft' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                        'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                      }>
                        {treeInfo.status}
                      </Badge>
                      <Badge variant="secondary">
                        {allBlockTypes.length} Blocks
                      </Badge>
                      <Badge variant="secondary">
                        {experimentNodes.length} Nodes
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}
        
        <div className="grid lg:grid-cols-6 gap-8">
          {/* Left Sidebar - Experiment Steps */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Experiment Steps</CardTitle>
                    <CardDescription>
                      Click on a step to view details
                    </CardDescription>
                  </div>
                  {hasEditPermission && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddBlockForm(true)}
                      className="flex items-center space-x-1"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Add Block</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div ref={scrollContainerRef} className="max-h-[60vh] overflow-y-auto">
                  <div className="space-y-3">
                  {allBlockTypes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No experiment steps yet.</p>
                      <p className="text-sm">Click "Add Block" to create your first step.</p>
                    </div>
                  ) : (
                    allBlockTypes.map((nodeType) => {
                      const nodes = groupedNodes[nodeType] || []
                      const isCollapsed = collapsedBlocks.has(nodeType)
                      // Calculate total references count in this block (sum of all references across all nodes)
                      const totalReferencesInBlock = nodes.reduce((sum: number, node: ExperimentNode) => {
                        return sum + (node.referenced_trees?.filter(tree => !tree.error).length || 0)
                      }, 0)
                      const hasReferencedNodes = totalReferencesInBlock > 0
                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'completed': return 'bg-green-500'
                          case 'in-progress': return 'bg-orange-500'
                          case 'pending': return 'bg-gray-400'
                          default: return 'bg-blue-500 dark:bg-blue-400'
                        }
                      }
                      
                      const isHighlighted = isBlockHighlighted(nodeType)
                      
                      return (
                        <div 
                          key={nodeType} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, 'block', nodeType)}
                          onDragOver={(e) => handleDragOver(e, 'block', nodeType)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, 'block', nodeType)}
                          onDragEnd={handleDragEnd}
                          className={`border rounded-lg overflow-hidden transition-all duration-200 cursor-move ${
                            isHighlighted ? 'border-primary shadow-md' : ''
                          } ${
                            draggedItem?.type === 'block' && draggedItem.id === nodeType ? 'opacity-50' : ''
                          } ${
                            dragOverItem?.type === 'block' && dragOverItem.id === nodeType ? 'border-primary bg-primary/10' : ''
                          }`}
                        >
                          {/* Block Header */}
                          <div className={`px-4 py-3 transition-colors ${
                            isHighlighted ? 'bg-primary/10' : 'bg-muted/30'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div 
                                className="flex items-center space-x-3 cursor-pointer hover:bg-muted/50 transition-colors rounded px-2 py-1 -mx-2 -my-1 flex-1"
                                onClick={() => toggleBlock(nodeType)}
                              >
                                <span className="text-lg flex-shrink-0">{getBlockIcon(nodeType)}</span>
                                <span className="text-sm font-medium flex-1 min-w-0">{getBlockTitle(nodeType)}</span>
                                {hasReferencedNodes && (
                                  <div className="flex items-center space-x-1 flex-shrink-0">
                                    <LinkIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                                    {totalReferencesInBlock > 1 && (
                                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                                        {totalReferencesInBlock}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  {nodes.length}
                                </Badge>
                                {isCollapsed ? (
                                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground ml-auto" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground ml-auto" />
                                )}
                              </div>
                              
                              {/* Block Management Menu */}
                              {hasEditPermission && (
                                <div className="flex items-center space-x-1 ml-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleAddNodeToBlock(nodeType)
                                    }}
                                    title={`Add ${getBlockTitle(nodeType).slice(0, -1)}`}
                                  >
                                    <PlusIcon className="h-3 w-3" />
                                  </Button>
                                
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <EllipsisVerticalIcon className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditBlock(nodeType)}>
                                        <PencilIcon className="h-4 w-4 mr-2" />
                                        Edit Block
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDeleteBlock(nodeType)}
                                        className="text-destructive"
                                      >
                                        <TrashIcon className="h-4 w-4 mr-2" />
                                        Delete Block
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Block Content */}
                          {!isCollapsed && (
                            <div className="p-3 space-y-2">
                              {nodes
                                .filter(node => node.type === nodeType)
                                .sort((a, b) => a.position - b.position)
                                .map((node) => {
                                const isSelected = selectedNodeId === node.id
                                
                                return (
                                  <div 
                                    id={`node-${node.id}`}
                                    key={node.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, 'node', node.id, nodeType)}
                                    onDragOver={(e) => handleDragOver(e, 'node', node.id, nodeType)}
                                    onDragLeave={(e) => handleDragLeave(e, 'node')}
                                    onDrop={(e) => handleDrop(e, 'node', node.id, nodeType)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => {
                                      // Always select the node when clicking anywhere on the card
                                      setSelectedNodeId(node.id)
                                    }}
                                    className={`border rounded-lg p-3 transition-all duration-200 cursor-pointer ${
                                      isSelected 
                                        ? 'bg-primary/10 border-primary shadow-md' 
                                        : 'hover:bg-muted/50'
                                    } ${
                                      draggedItem?.type === 'node' && draggedItem.id === node.id ? 'opacity-50' : ''
                                    } ${
                                      dragOverItem?.type === 'node' && dragOverItem.id === node.id ? 'border-primary bg-primary/10' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                                        <div className={`w-2 h-2 ${getStatusColor(node.status)} rounded-full flex-shrink-0`}></div>
                                        <span className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                                          {node.title}
                                        </span>
                                        {/* Navigate button for references */}
                                        {node.referenced_trees && node.referenced_trees.filter(tree => !tree.error).length > 0 && (
                                          <>
                                            {node.referenced_trees.filter(tree => !tree.error).length === 1 ? (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-black dark:hover:text-blue-400"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  const tree = node.referenced_trees.find(t => !t.error)
                                                  if (tree) {
                                                    sessionStorage.setItem('tree_nav_context', JSON.stringify({
                                                      fromTreeId: treeId,
                                                      fromProjectId: projectId,
                                                      fromNodeId: node.id
                                                    }))
                                                    router.push(`/project/${projectId}/trees/${tree.id}`)
                                                  }
                                                }}
                                                title={`Navigate to ${node.referenced_trees.find(t => !t.error)?.name}`}
                                              >
                                                <LinkIcon className="h-3 w-3 text-blue-500 dark:text-blue-400 mr-1" />
                                                Navigate
                                              </Button>
                                            ) : (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-black dark:hover:text-blue-400"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setReferenceModalNode(node)
                                                  setShowReferenceModal(true)
                                                }}
                                                title="Select tree to navigate"
                                              >
                                                <LinkIcon className="h-3 w-3 text-blue-500 dark:text-blue-400 mr-1" />
                                                Navigate ({node.referenced_trees.filter(t => !t.error).length})
                                              </Button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                      
                                      {/* Node Management Buttons */}
                                      {hasEditPermission && (
                                        <div className="flex items-center space-x-1 ml-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setSelectedNodeId(node.id)
                                              setShowEditForm(true)
                                            }}
                                            title="Edit Node"
                                          >
                                            <PencilIcon className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              deleteNode(node.id)
                                            }}
                                            title="Delete Node"
                                          >
                                            <TrashIcon className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {node.status === 'completed' ? '(Completed)' : node.status === 'in-progress' ? '(In Progress)' : ''}
                                    </p>
                                    {/* Show error badges for broken references */}
                                    {node.referenced_trees && node.referenced_trees.some(tree => tree.error) && (
                                      <div className="mt-2 space-y-1">
                                        {node.referenced_trees.map((tree, idx) => {
                                          if (!tree.error) return null
                                          return (
                                            <div key={`${node.id}-${tree.id || `error-${idx}`}`} className="text-xs">
                                              {tree.error === 'not_found' ? (
                                                <Badge variant="destructive" className="text-xs">
                                                  Referenced tree deleted
                                                </Badge>
                                              ) : tree.error === 'access_denied' ? (
                                                <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">
                                                  No access to referenced tree
                                                </Badge>
                                              ) : null}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Right Column - Node Details */}
          <div className="lg:col-span-4">
            {selectedNode ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle>{selectedNode.title}</CardTitle>
                      <CardDescription>
                        {selectedNode.description}
                      </CardDescription>
                      {/* Reference badges - below description, stacked vertically */}
                      {selectedNode.referenced_trees && selectedNode.referenced_trees.length > 0 && (
                        <div className="flex flex-col space-y-1 mt-3">
                          {selectedNode.referenced_trees
                            .filter(tree => !tree.error)
                            .map((tree) => (
                              <Badge
                                key={tree.id}
                                variant="outline"
                                className="text-xs cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 whitespace-nowrap w-fit"
                                onClick={() => {
                                  // Store navigation context
                                  sessionStorage.setItem('tree_nav_context', JSON.stringify({
                                    fromTreeId: treeId,
                                    fromProjectId: projectId,
                                    fromNodeId: selectedNode.id
                                  }))
                                  // Navigate to referenced tree
                                  router.push(`/project/${projectId}/trees/${tree.id}`)
                                }}
                                title={`Navigate to ${tree.name}`}
                              >
                                {tree.name}
                              </Badge>
                            ))}
                          {selectedNode.referenced_trees.some(tree => tree.error) && (
                            <Badge variant="destructive" className="text-xs whitespace-nowrap w-fit">
                              Error
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {hasEditPermission && (
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEditForm(true)}
                          className="flex items-center space-x-1"
                        >
                          <PencilIcon className="h-4 w-4" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteNode(selectedNode.id)}
                          className="flex items-center space-x-1 text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="content" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="attachments">Attachments</TabsTrigger>
                      <TabsTrigger value="links">Links</TabsTrigger>
                      <TabsTrigger value="metadata">Metadata</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content">
                      <div id="content" className="border rounded-lg p-4">
                        <div className="flex items-center justify-end gap-2 mb-4">
                          {hasEditPermission && (
                            <>
                              {!editingContent && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={startEditingContent}
                                  className="flex items-center space-x-1"
                                >
                                  <PencilIcon className="h-4 w-4" />
                                  <span>Edit Content</span>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingDependencies(!editingDependencies)}
                                className="flex items-center space-x-1"
                              >
                                <PencilIcon className="h-4 w-4" />
                                <span>{editingDependencies ? 'Done' : 'Edit Dependencies'}</span>
                              </Button>
                              {editingDependencies && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowAddDependencyModal(true)}
                                  className="flex items-center space-x-1"
                                >
                                  <PlusIcon className="h-4 w-4" />
                                  <span>Add</span>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        
                        {/* Dependencies section */}
                        <div className="mb-4 pb-4 border-b">
                          <div className="mb-2">
                            <h5 className="text-sm font-medium">Dependencies</h5>
                          </div>
                          
                          {selectedNode && selectedNode.dependencies && selectedNode.dependencies.length > 0 ? (
                            <div className="space-y-2">
                              {selectedNode.dependencies.map((dep) => {
                                const depLabels: Record<string, string> = {
                                  requires: 'Requires',
                                  uses_output: 'Uses Output',
                                  follows: 'Follows',
                                  validates: 'Validates',
                                }
                                const depLabel = depLabels[dep.dependency_type] || dep.dependency_type
                                
                                return (
                                  <div key={dep.id} className="flex items-center justify-between p-2 border rounded-lg">
                                    <div className="flex items-center gap-2 text-sm flex-1">
                                      <Badge variant="outline" className="text-xs">
                                        {depLabel}
                                      </Badge>
                                      <button
                                        onClick={() => setSelectedNodeId(dep.to_node_id)}
                                        className="text-primary hover:underline cursor-pointer"
                                        disabled={editingDependencies}
                                      >
                                        {dep.to_node_name}
                                      </button>
                                    </div>
                                    {editingDependencies && (
                                      <div className="flex items-center gap-2">
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            setEditingDependency(dep)
                                            setShowEditDependencyModal(true)
                                          }}
                                        >
                                          <PencilIcon className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            if (confirm('Are you sure you want to delete this dependency?')) {
                                              deleteDependency(dep.id)
                                            }
                                          }}
                                          className="text-destructive hover:text-destructive"
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              {editingDependencies ? (
                                <p className="italic">No dependencies yet. Click "Add" to create one.</p>
                              ) : (
                                <p className="italic">No dependencies</p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {editingContent ? (
                          <div className="space-y-4">
                            <textarea
                              value={tempContent}
                              onChange={(e) => setTempContent(e.target.value)}
                              placeholder="Enter content for this node..."
                              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                              rows={6}
                            />
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                onClick={saveContent}
                                className="flex items-center space-x-1"
                              >
                                <span>Save</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEditingContent}
                                className="flex items-center space-x-1"
                              >
                                <span>Cancel</span>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap">
                            {selectedNode.content || 'No content available. Click Edit to add content.'}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="attachments">
                      <div id="attachments" className="border rounded-lg p-4">
                        <div className="flex items-center justify-end mb-4">
                          {hasEditPermission && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingAttachments(!editingAttachments)}
                              className="flex items-center space-x-1"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span>{editingAttachments ? 'Done' : 'Edit'}</span>
                            </Button>
                          )}
                        </div>
                        
                        <div className="space-y-4">
                          {selectedNode.attachments.length > 0 ? (
                            selectedNode.attachments.map((attachment) => (
                              <div key={attachment.id} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                                      <span className="text-xs font-medium">
                                        {attachment.file_type === 'PDF' ? 'PDF' : 
                                         attachment.file_type === 'HTML Report' ? 'HTML' :
                                         attachment.file_type === 'Image' ? 'IMG' :
                                         attachment.file_type === 'Log File' ? 'LOG' :
                                         attachment.file_type === 'CSV' ? 'CSV' : 'FILE'}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{attachment.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {attachment.file_type} • {attachment.file_size ? `${(attachment.file_size / 1024 / 1024).toFixed(1)} MB` : 'Unknown size'}
                                      </p>
                                      {attachment.description && (
                                        <p className="text-xs text-muted-foreground mt-1">{attachment.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {editingAttachments && (
                                      <>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            setEditingAttachment(attachment)
                                            setShowEditAttachmentModal(true)
                                          }}
                                        >
                                          <PencilIcon className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            if (confirm('Are you sure you want to delete this attachment?')) {
                                              deleteAttachment(attachment.id)
                                            }
                                          }}
                                          className="text-destructive hover:text-destructive"
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    {attachment.file_type === 'video/youtube' || attachment.file_type === 'video/file' ? (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => {
                                          setVideoAttachment(attachment)
                                          setShowVideoModal(true)
                                        }}
                                      >
                                        🎥 Watch
                                      </Button>
                                    ) : (
                                      <Button variant="outline" size="sm" asChild>
                                        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                                          Download
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
                              <p>No attachments yet.</p>
                              {editingAttachments && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowAddAttachmentModal(true)}
                                  className="mt-2"
                                >
                                  <PlusIcon className="h-4 w-4 mr-2" />
                                  Add Attachment
                                </Button>
                              )}
                            </div>
                          )}
                          
                          {editingAttachments && selectedNode.attachments.length > 0 && (
                            <div className="border-t pt-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddAttachmentModal(true)}
                                className="flex items-center space-x-1"
                              >
                                <PlusIcon className="h-4 w-4" />
                                <span>Add Attachment</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="links">
                      <div id="links" className="border rounded-lg p-4">
                        <div className="flex items-center justify-end mb-4">
                          {hasEditPermission && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingLinks(!editingLinks)}
                              className="flex items-center space-x-1"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span>{editingLinks ? 'Done' : 'Edit'}</span>
                            </Button>
                          )}
                        </div>
                        
                        <div className="space-y-4">
                          {selectedNode.links.length > 0 ? (
                            selectedNode.links.map((link) => (
                              <div key={link.id} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">{link.name}</p>
                                    <p className="text-xs text-muted-foreground">{link.url}</p>
                                    {link.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{link.description}</p>
                                    )}
                                    <Badge variant="outline" className="mt-1 text-xs">
                                      {link.link_type}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {editingLinks && (
                                      <>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            setEditingLink(link)
                                            setShowEditLinkModal(true)
                                          }}
                                        >
                                          <PencilIcon className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            if (confirm('Are you sure you want to delete this link?')) {
                                              deleteLink(link.id)
                                            }
                                          }}
                                          className="text-destructive hover:text-destructive"
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="outline" size="sm" asChild>
                                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                                        Open
                                      </a>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
                              <p>No links yet.</p>
                              {editingLinks && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowAddLinkModal(true)}
                                  className="mt-2"
                                >
                                  <PlusIcon className="h-4 w-4 mr-2" />
                                  Add Link
                                </Button>
                              )}
                            </div>
                          )}
                          
                          {editingLinks && selectedNode.links.length > 0 && (
                            <div className="border-t pt-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddLinkModal(true)}
                                className="flex items-center space-x-1"
                              >
                                <PlusIcon className="h-4 w-4" />
                                <span>Add Link</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="metadata">
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-end mb-4">
                          {!editingMetadata && hasEditPermission && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={startEditingMetadata}
                              className="flex items-center space-x-1"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span>Edit</span>
                            </Button>
                          )}
                        </div>
                        
                        {editingMetadata && tempMetadata ? (
                          <MetadataEditForm
                            metadata={tempMetadata}
                            status={selectedNode.status}
                            experimentNodes={experimentNodes}
                            currentGroupKey={selectedNode.type}
                            onSave={saveMetadata}
                            onCancel={cancelEditingMetadata}
                          />
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-medium mb-2">Step Information</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Type:</span>
                                    <Badge>{selectedNode.metadata.type}</Badge>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Position:</span>
                                    <span>{selectedNode.position}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status:</span>
                                    <Badge variant={selectedNode.status === 'completed' ? 'default' : 'secondary'}>
                                      {selectedNode.status}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2">Timestamps</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Created:</span>
                                    <span>{new Date(selectedNode.metadata.created).toLocaleDateString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Updated:</span>
                                    <span>{new Date(selectedNode.metadata.updated).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg font-medium">No node selected</p>
                    <p className="text-sm">Click on an experiment step to view its details</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Node Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Create New Node</h3>
            <CreateNodeForm
              projectId={projectId}
              currentTreeId={treeId}
              onSubmit={createNode}
              onCancel={() => setShowCreateForm(false)}
              loading={creating}
            />
          </div>
        </div>
      )}

      {/* Edit Node Modal */}
      {showEditForm && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Node</h3>
            <EditNodeForm
              node={selectedNode}
              projectId={projectId}
              currentTreeId={treeId}
              onSubmit={(name, description, nodeType, referencedTreeIds) => 
                editNode(selectedNode.id, name, description, nodeType, referencedTreeIds)
              }
              onCancel={() => setShowEditForm(false)}
              loading={editing}
            />
          </div>
        </div>
      )}

      {/* Add Attachment Modal */}
      {showAddAttachmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Attachment</h3>
            <AddAttachmentForm
              onSubmit={(name, fileType, fileSize, fileUrl, description) => {
                addAttachment(name, fileType, fileSize, fileUrl, description)
                setShowAddAttachmentModal(false)
              }}
              onCancel={() => setShowAddAttachmentModal(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Attachment Modal */}
      {showEditAttachmentModal && editingAttachment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Attachment</h3>
            <EditAttachmentForm
              attachment={editingAttachment}
              onSubmit={(name, fileType, fileSize, fileUrl, description) => {
                updateAttachment(editingAttachment.id, name, fileType, fileSize, fileUrl, description)
                setShowEditAttachmentModal(false)
                setEditingAttachment(null)
              }}
              onCancel={() => {
                setShowEditAttachmentModal(false)
                setEditingAttachment(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Link</h3>
            <AddLinkForm
              onSubmit={(name, url, description, linkType) => {
                addLink(name, url, description, linkType)
                setShowAddLinkModal(false)
              }}
              onCancel={() => setShowAddLinkModal(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Link Modal */}
      {showEditLinkModal && editingLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Link</h3>
            <EditLinkForm
              link={editingLink}
              onSubmit={(name, url, description, linkType) => {
                updateLink(editingLink.id, name, url, description, linkType)
                setShowEditLinkModal(false)
                setEditingLink(null)
              }}
              onCancel={() => {
                setShowEditLinkModal(false)
                setEditingLink(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Add Dependency Modal */}
      {showAddDependencyModal && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Dependency</h3>
            <AddDependencyForm
              currentNodeId={selectedNode.id}
              experimentNodes={experimentNodes}
              onSubmit={(to_node_id, dependency_type) => {
                addDependency(to_node_id, dependency_type)
              }}
              onCancel={() => setShowAddDependencyModal(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Dependency Modal */}
      {showEditDependencyModal && editingDependency && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Dependency</h3>
            <EditDependencyForm
              dependency={editingDependency}
              currentNodeId={selectedNode.id}
              experimentNodes={experimentNodes}
              onSubmit={(to_node_id, dependency_type) => {
                updateDependency(editingDependency.id, to_node_id, dependency_type)
              }}
              onCancel={() => {
                setShowEditDependencyModal(false)
                setEditingDependency(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Video Viewer Modal */}
      {showVideoModal && videoAttachment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-4xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{videoAttachment.name}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowVideoModal(false)
                  setVideoAttachment(null)
                }}
              >
                ✕
              </Button>
            </div>
            <VideoEmbed
              url={videoAttachment.file_url}
              type={videoAttachment.file_type}
            />
            {videoAttachment.description && (
              <p className="text-sm text-muted-foreground mt-4">{videoAttachment.description}</p>
            )}
          </div>
        </div>
      )}

      {/* Add Block Modal */}
      {showAddBlockForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Block</h3>
            <AddBlockForm
              onSubmit={async (blockName, blockType) => {
                try {
                  // Get session for authentication
                  const { data: { session } } = await supabase.auth.getSession()
                  
                  const response = await fetch(`/api/trees/${treeId}/blocks`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({
                      name: blockName,
                      blockType: blockType
                    }),
                  })

                  if (!response.ok) {
                    throw new Error('Failed to create block')
                  }

                  const data = await response.json()
                  
                  // Refresh blocks from API instead of updating local state
                  // This prevents duplicates and ensures consistency
                  const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`, {
                    headers: {
                      'Authorization': `Bearer ${session?.access_token}`
                    }
                  })
                  if (blocksResponse.ok) {
                    const blocksData = await blocksResponse.json()
                    setCustomBlocks(blocksData.treeBlocks || [])
                    
                    // Set block names from tree blocks
                    const names: Record<string, string> = {}
                    blocksData.treeBlocks?.forEach((block: any) => {
                      names[block.id] = block.name
                    })
                    setBlockNames(names)
                  }
                  
                  setShowAddBlockForm(false)
                } catch (err) {
                  console.error('Error creating block:', err)
                  alert('Failed to create block')
                }
              }}
              onCancel={() => setShowAddBlockForm(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Block Modal */}
      {showEditBlockForm && editingBlockType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Block</h3>
            <EditBlockForm
              blockType={editingBlockType}
              currentBlock={customBlocks.find(block => block.id === editingBlockType)}
              onSubmit={async (newBlockName, newBlockType) => {
                try {
                  if (!editingBlockType) return

                  // Get the current session token
                  const { data: { session } } = await supabase.auth.getSession()
                  if (!session?.access_token) {
                    throw new Error('No authentication token available')
                  }

                  const response = await fetch(`/api/trees/${treeId}/blocks/${editingBlockType}`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                      name: newBlockName,
                      blockType: newBlockType
                    }),
                  })

                  if (!response.ok) {
                    throw new Error('Failed to update block')
                  }

                  // Refresh blocks from API instead of updating local state
                  const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`, {
                    headers: {
                      'Authorization': `Bearer ${session?.access_token}`
                    }
                  })
                  if (blocksResponse.ok) {
                    const blocksData = await blocksResponse.json()
                    setCustomBlocks(blocksData.treeBlocks || [])
                    
                    // Set block names from tree blocks
                    const names: Record<string, string> = {}
                    blocksData.treeBlocks?.forEach((block: any) => {
                      names[block.id] = block.name
                    })
                    setBlockNames(names)
                  }
                  
                  setShowEditBlockForm(false)
                  setEditingBlockType(null)
                } catch (err) {
                  console.error('Error updating block:', err)
                  alert('Failed to update block')
                }
              }}
              onCancel={() => {
                setShowEditBlockForm(false)
                setEditingBlockType(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Hierarchy Modal */}
      {showHierarchyModal && nestingContext && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Tree Hierarchy</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHierarchyModal(false)}
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-6">
              {/* Parent Trees */}
              {nestingContext.parents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3 text-muted-foreground">Parent Trees ({nestingContext.parents.length})</h4>
                  <div className="space-y-2">
                    {nestingContext.parents.map((parent) => (
                      <div
                        key={parent.node_id}
                        className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          sessionStorage.setItem('tree_nav_context', JSON.stringify({
                            fromTreeId: treeId,
                            fromProjectId: projectId,
                            fromNodeId: parent.node_id
                          }))
                          router.push(`/project/${projectId}/trees/${parent.tree_id}`)
                        }}
                      >
                        <div className="font-medium">{parent.tree_name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Referenced by node: {parent.node_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Tree */}
              <div>
                <h4 className="text-sm font-medium mb-3 text-muted-foreground">Current Tree</h4>
                <div className="p-3 border-2 border-primary rounded-lg bg-primary/5">
                  <div className="font-medium">{nestingContext.current.name}</div>
                  <Badge variant="outline" className="mt-2">{nestingContext.current.status}</Badge>
                </div>
              </div>

              {/* Child Trees */}
              {nestingContext.children.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Nested Trees ({nestingContext.children.length})</h4>
                    <div className="space-y-2">
                      {nestingContext.children.map((child, index) => (
                        <div
                          key={`${child.tree_id}-${child.node_id}-${index}`}
                          className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          sessionStorage.setItem('tree_nav_context', JSON.stringify({
                            fromTreeId: treeId,
                            fromProjectId: projectId,
                            fromNodeId: child.node_id
                          }))
                          router.push(`/project/${projectId}/trees/${child.tree_id}`)
                        }}
                      >
                        <div className="font-medium">{child.tree_name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Referenced by node: {child.node_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reference Selection Modal */}
      {showReferenceModal && referenceModalNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Tree to Navigate</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowReferenceModal(false)
                  setReferenceModalNode(null)
                }}
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-2">
              {referenceModalNode.referenced_trees
                .filter(tree => !tree.error)
                .map((tree) => (
                  <div
                    key={tree.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      sessionStorage.setItem('tree_nav_context', JSON.stringify({
                        fromTreeId: treeId,
                        fromProjectId: projectId,
                        fromNodeId: referenceModalNode.id
                      }))
                      router.push(`/project/${projectId}/trees/${tree.id}`)
                      setShowReferenceModal(false)
                      setReferenceModalNode(null)
                    }}
                  >
                    <div className="font-medium">{tree.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {tree.description || 'No description'}
                    </div>
                    <Badge variant="outline" className="mt-2 text-xs">
                      {tree.status}
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Permanent AI Chat Sidebar Toggle - Full Height Bar */}
      <div className="fixed right-0 top-0 bottom-0 w-12 z-50 bg-background border-l border-border">
        <button
          onClick={() => {
            setShowAIChatSidebar(prev => !prev)
          }}
          className={cn(
            "w-full h-full flex flex-col items-center justify-center gap-3",
            "hover:bg-muted/50 transition-colors",
            "group"
          )}
          aria-label="Toggle AI Chat"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Sparkles className="h-5 w-5 text-purple-500 dark:text-purple-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors relative z-10" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-7 w-7 rounded-full bg-purple-500/40 dark:bg-purple-400/40 blur-lg animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full bg-purple-500/30 dark:bg-purple-400/30 blur-sm animate-pulse" style={{ animationDelay: '0.5s' }} />
                </div>
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <kbd className="hidden sm:flex items-center justify-center px-2.5 py-1.5 text-base font-mono font-semibold text-muted-foreground bg-muted rounded border border-border shadow-sm">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      </div>
      
      {/* AI Chat Sidebar */}
      <AIChatSidebar
        treeId={treeId}
        projectId={projectId}
        open={showAIChatSidebar}
        onOpenChange={setShowAIChatSidebar}
      />
    </div>
  )
}

// Create Node Form Component
function CreateNodeForm({
  projectId,
  currentTreeId,
  onSubmit, 
  onCancel, 
  loading 
}: { 
  projectId: string
  currentTreeId: string
  onSubmit: (name: string, description: string, nodeType: string, referencedTreeIds: string[]) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nodeType, setNodeType] = useState('protocol')
  const [referencedTreeIds, setReferencedTreeIds] = useState<string[]>([])
  const [availableTrees, setAvailableTrees] = useState<Array<{id: string, name: string}>>([])

  // Fetch available trees from the same project
  useEffect(() => {
    const fetchTrees = async () => {
      try {
        const response = await authFetch(`/api/projects/${projectId}/trees`, {
          requireAuth: true
        })
        if (response.ok) {
          const data = await response.json()
          // Filter out the current tree
          const trees = (data.trees || []).filter((tree: any) => tree.id !== currentTreeId)
          setAvailableTrees(trees)
        }
      } catch (err) {
        console.error('Error fetching trees:', err)
      }
    }
    fetchTrees()
  }, [projectId, currentTreeId])

  const toggleTreeReference = (treeId: string) => {
    setReferencedTreeIds(prev => {
      if (prev.includes(treeId)) {
        return prev.filter(id => id !== treeId)
      } else {
        if (prev.length >= 3) {
          alert('Maximum of 3 tree references allowed per node')
          return prev
        }
        return [...prev, treeId]
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      if (referencedTreeIds.length > 3) {
        alert('Maximum of 3 tree references allowed per node')
        return
      }
      onSubmit(name.trim(), description.trim(), nodeType, referencedTreeIds)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Node Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter node name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter node description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Node Type</label>
        <select
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_creation">Data Creation</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Reference Trees (Optional - Max 3)
        </label>
        <div className="border border-input rounded-md p-3 max-h-48 overflow-y-auto">
          {availableTrees.length === 0 ? (
            <p className="text-xs text-muted-foreground">No other trees available in this project</p>
          ) : (
            <div className="space-y-2">
              {availableTrees.map((tree) => (
                <label
                  key={tree.id}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={referencedTreeIds.includes(tree.id)}
                    onChange={() => toggleTreeReference(tree.id)}
                    disabled={!referencedTreeIds.includes(tree.id) && referencedTreeIds.length >= 3}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm flex-1">{tree.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {referencedTreeIds.length > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              {referencedTreeIds.length} of 3 selected
            </span>
          )}
          {referencedTreeIds.length === 0 && 'Select trees to reference (maximum 3 per node)'}
        </p>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={loading || !name.trim()} className="flex-1">
          {loading ? 'Creating...' : 'Create Node'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function EditNodeForm({ 
  node,
  projectId,
  currentTreeId,
  onSubmit, 
  onCancel, 
  loading 
}: { 
  node: ExperimentNode
  projectId: string
  currentTreeId: string
  onSubmit: (name: string, description: string, nodeType: string, referencedTreeIds: string[]) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState(node.title)
  const [description, setDescription] = useState(node.description || '')
  const [nodeType, setNodeType] = useState(node.type)
  const [referencedTreeIds, setReferencedTreeIds] = useState<string[]>(node.referenced_tree_ids || [])
  const [availableTrees, setAvailableTrees] = useState<Array<{id: string, name: string}>>([])

  // Fetch available trees from the same project
  useEffect(() => {
    const fetchTrees = async () => {
      try {
        const response = await authFetch(`/api/projects/${projectId}/trees`, {
          requireAuth: true
        })
        if (response.ok) {
          const data = await response.json()
          // Filter out the current tree
          const trees = (data.trees || []).filter((tree: any) => tree.id !== currentTreeId)
          setAvailableTrees(trees)
        }
      } catch (err) {
        console.error('Error fetching trees:', err)
      }
    }
    fetchTrees()
  }, [projectId, currentTreeId])

  const toggleTreeReference = (treeId: string) => {
    setReferencedTreeIds(prev => {
      if (prev.includes(treeId)) {
        return prev.filter(id => id !== treeId)
      } else {
        if (prev.length >= 3) {
          alert('Maximum of 3 tree references allowed per node')
          return prev
        }
        return [...prev, treeId]
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      if (referencedTreeIds.length > 3) {
        alert('Maximum of 3 tree references allowed per node')
        return
      }
      onSubmit(name.trim(), description.trim(), nodeType, referencedTreeIds)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Node Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter node name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter node description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Node Type</label>
        <select
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_creation">Data Creation</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Reference Trees (Optional - Max 3)
        </label>
        <div className="border border-input rounded-md p-3 max-h-48 overflow-y-auto">
          {availableTrees.length === 0 ? (
            <p className="text-xs text-muted-foreground">No other trees available in this project</p>
          ) : (
            <div className="space-y-2">
              {availableTrees.map((tree) => (
                <label
                  key={tree.id}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={referencedTreeIds.includes(tree.id)}
                    onChange={() => toggleTreeReference(tree.id)}
                    disabled={!referencedTreeIds.includes(tree.id) && referencedTreeIds.length >= 3}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm flex-1">{tree.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {referencedTreeIds.length > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              {referencedTreeIds.length} of 3 selected
            </span>
          )}
          {referencedTreeIds.length === 0 && 'Select trees to reference (maximum 3 per node)'}
        </p>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={loading || !name.trim()} className="flex-1">
          {loading ? 'Updating...' : 'Update Node'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function MetadataEditForm({ 
  metadata,
  status,
  experimentNodes,
  currentGroupKey,
  onSave, 
  onCancel
}: { 
  metadata: ExperimentNode['metadata']
  status: string
  experimentNodes: ExperimentNode[]
  currentGroupKey: string
  onSave: (type: string, position: number, status: string) => void
  onCancel: () => void
}) {
  const [nodeType, setNodeType] = useState(metadata.type)
  const [position, setPosition] = useState(metadata.position)
  const [nodeStatus, setNodeStatus] = useState(status)
  
  // Use the same grouping key as node rendering: node.type (block_id || node_type)
  // When the form first loads, group by the current node's effective key (currentGroupKey).
  // When the type changes in the form, group by the selected nodeType instead.
  const effectiveGroupKey = nodeType === metadata.type ? currentGroupKey : nodeType
  const maxPosition = Math.max(1, experimentNodes.filter(n => n.type === effectiveGroupKey).length)

  // Update position when node type changes, clamp between 1 and max
  useEffect(() => {
    const groupKey = nodeType === metadata.type ? currentGroupKey : nodeType
    const newMaxPosition = Math.max(1, experimentNodes.filter(n => n.type === groupKey).length)
    if (position > newMaxPosition) {
      setPosition(newMaxPosition)
    } else if (position < 1) {
      setPosition(1)
    }
  }, [nodeType, position, experimentNodes, currentGroupKey, metadata.type])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(nodeType, position, nodeStatus)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Node Type</label>
        <select
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_creation">Data Creation</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Position (1-{maxPosition})</label>
        <input
          type="number"
          value={position}
          onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
          min="1"
          max={maxPosition}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Status</label>
        <select
          value={nodeStatus}
          onChange={(e) => setNodeStatus(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" className="flex-1">
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Add Attachment Form Component
function AddAttachmentForm({ 
  onSubmit, 
  onCancel
}: { 
  onSubmit: (name: string, fileType: string, fileSize: number, fileUrl: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [fileType, setFileType] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [fileUrl, setFileUrl] = useState('')
  const [description, setDescription] = useState('')
  const [isVideo, setIsVideo] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && fileUrl.trim()) {
      onSubmit(name.trim(), fileType, fileSize, fileUrl.trim(), description.trim())
    }
  }

  const handleUrlChange = (url: string) => {
    setFileUrl(url)
    
    // Auto-detect YouTube videos
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      setIsVideo(true)
      setFileType('video/youtube')
    } else if (url.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
      setIsVideo(true)
      setFileType('video/file')
    } else {
      setIsVideo(false)
      // Auto-detect file type from URL
      const extension = url.split('.').pop()?.toLowerCase()
      if (extension) {
        switch (extension) {
          case 'pdf': setFileType('application/pdf'); break
          case 'doc': case 'docx': setFileType('application/msword'); break
          case 'xls': case 'xlsx': setFileType('application/vnd.ms-excel'); break
          case 'jpg': case 'jpeg': case 'png': case 'gif': setFileType('image'); break
          case 'txt': setFileType('text/plain'); break
          default: setFileType('application/octet-stream')
        }
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter attachment name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File URL</label>
        <input
          type="url"
          value={fileUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="Enter file URL or YouTube link"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        {isVideo && (
          <p className="text-xs text-muted-foreground mt-1">
            🎥 Video detected - will be embedded for viewing
          </p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File Type</label>
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Auto-detect</option>
          <option value="application/pdf">PDF</option>
          <option value="application/msword">Word Document</option>
          <option value="application/vnd.ms-excel">Excel Spreadsheet</option>
          <option value="image">Image</option>
          <option value="video/youtube">YouTube Video</option>
          <option value="video/file">Video File</option>
          <option value="text/plain">Text File</option>
          <option value="application/octet-stream">Other</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File Size (bytes)</label>
        <input
          type="number"
          value={fileSize}
          onChange={(e) => setFileSize(parseInt(e.target.value) || 0)}
          placeholder="Enter file size in bytes"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter attachment description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!name.trim() || !fileUrl.trim()} className="flex-1">
          Add Attachment
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Edit Attachment Form Component
function EditAttachmentForm({ 
  attachment,
  onSubmit, 
  onCancel
}: { 
  attachment: ExperimentNode['attachments'][0]
  onSubmit: (name: string, fileType: string, fileSize: number, fileUrl: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(attachment.name)
  const [fileType, setFileType] = useState(attachment.file_type)
  const [fileSize, setFileSize] = useState(attachment.file_size)
  const [fileUrl, setFileUrl] = useState(attachment.file_url)
  const [description, setDescription] = useState(attachment.description)
  const [isVideo, setIsVideo] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && fileUrl.trim()) {
      onSubmit(name.trim(), fileType, fileSize, fileUrl.trim(), description.trim())
    }
  }

  const handleUrlChange = (url: string) => {
    setFileUrl(url)
    
    // Auto-detect YouTube videos
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      setIsVideo(true)
      setFileType('video/youtube')
    } else if (url.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
      setIsVideo(true)
      setFileType('video/file')
    } else {
      setIsVideo(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter attachment name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File URL</label>
        <input
          type="url"
          value={fileUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="Enter file URL or YouTube link"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        {isVideo && (
          <p className="text-xs text-muted-foreground mt-1">
            🎥 Video detected - will be embedded for viewing
          </p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File Type</label>
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="application/pdf">PDF</option>
          <option value="application/msword">Word Document</option>
          <option value="application/vnd.ms-excel">Excel Spreadsheet</option>
          <option value="image">Image</option>
          <option value="video/youtube">YouTube Video</option>
          <option value="video/file">Video File</option>
          <option value="text/plain">Text File</option>
          <option value="application/octet-stream">Other</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">File Size (bytes)</label>
        <input
          type="number"
          value={fileSize}
          onChange={(e) => setFileSize(parseInt(e.target.value) || 0)}
          placeholder="Enter file size in bytes"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter attachment description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!name.trim() || !fileUrl.trim()} className="flex-1">
          Update Attachment
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Add Link Form Component
function AddLinkForm({ 
  onSubmit, 
  onCancel
}: { 
  onSubmit: (name: string, url: string, description: string, linkType: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [linkType, setLinkType] = useState('external')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && url.trim()) {
      onSubmit(name.trim(), url.trim(), description.trim(), linkType)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter link name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter link URL"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Link Type</label>
        <select
          value={linkType}
          onChange={(e) => setLinkType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="external">External Link</option>
          <option value="internal">Internal Link</option>
          <option value="documentation">Documentation</option>
          <option value="reference">Reference</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter link description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!name.trim() || !url.trim()} className="flex-1">
          Add Link
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Edit Link Form Component
function EditLinkForm({ 
  link,
  onSubmit, 
  onCancel
}: { 
  link: ExperimentNode['links'][0]
  onSubmit: (name: string, url: string, description: string, linkType: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(link.name)
  const [url, setUrl] = useState(link.url)
  const [description, setDescription] = useState(link.description)
  const [linkType, setLinkType] = useState(link.link_type)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && url.trim()) {
      onSubmit(name.trim(), url.trim(), description.trim(), linkType)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter link name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter link URL"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Link Type</label>
        <select
          value={linkType}
          onChange={(e) => setLinkType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="external">External Link</option>
          <option value="internal">Internal Link</option>
          <option value="documentation">Documentation</option>
          <option value="reference">Reference</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter link description"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!name.trim() || !url.trim()} className="flex-1">
          Update Link
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Video Embed Component
function VideoEmbed({ url, type }: { url: string; type: string }) {
  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
  }

  const getYouTubeEmbedUrl = (url: string) => {
    const videoId = getYouTubeVideoId(url)
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null
  }

  if (type === 'video/youtube') {
    const embedUrl = getYouTubeEmbedUrl(url)
    if (embedUrl) {
      return (
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={embedUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute top-0 left-0 w-full h-full rounded-lg"
          />
        </div>
      )
    } else {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p>Invalid YouTube URL</p>
          <Button variant="outline" size="sm" asChild className="mt-2">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open in YouTube
            </a>
          </Button>
        </div>
      )
    }
  } else if (type === 'video/file') {
    return (
      <div className="relative w-full">
        <video
          controls
          className="w-full h-auto rounded-lg"
          style={{ maxHeight: '70vh' }}
        >
          <source src={url} type="video/mp4" />
          <source src={url} type="video/webm" />
          <source src={url} type="video/ogg" />
          Your browser does not support the video tag.
        </video>
      </div>
    )
  }

  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>Unsupported video type</p>
      <Button variant="outline" size="sm" asChild className="mt-2">
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open Video
        </a>
      </Button>
    </div>
  )
}

// Add Block Form Component
function AddBlockForm({ 
  onSubmit, 
  onCancel
}: { 
  onSubmit: (blockName: string, blockType: string) => void
  onCancel: () => void
}) {
  const [blockName, setBlockName] = useState('')
  const [blockType, setBlockType] = useState('custom')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (blockName.trim()) {
      onSubmit(blockName.trim(), blockType)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Block Name</label>
        <input
          type="text"
          value={blockName}
          onChange={(e) => setBlockName(e.target.value)}
          placeholder="Enter block name (e.g., 'Data Collection', 'Quality Control')"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Block Type (for categorization)</label>
        <select
          value={blockType}
          onChange={(e) => setBlockType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_creation">Data Creation</option>
          <option value="results">Results</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" className="flex-1" disabled={!blockName.trim()}>
          Add Block
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Edit Block Form Component
function EditBlockForm({ 
  blockType,
  currentBlock,
  onSubmit, 
  onCancel
}: { 
  blockType: string
  currentBlock?: { id: string, name: string, block_type: string, position: number }
  onSubmit: (newBlockName: string, newBlockType: string) => void
  onCancel: () => void
}) {
  // Pre-fill form with current block data
  const [newBlockName, setNewBlockName] = useState(currentBlock?.name || '')
  const [newBlockType, setNewBlockType] = useState(currentBlock?.block_type || 'custom')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newBlockName.trim()) {
      onSubmit(newBlockName.trim(), newBlockType)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Block Name</label>
        <input
          type="text"
          value={newBlockName}
          onChange={(e) => setNewBlockName(e.target.value)}
          placeholder="Enter block name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Block Type</label>
        <select
          value={newBlockType}
          onChange={(e) => setNewBlockType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="protocol">Protocol</option>
          <option value="analysis">Analysis</option>
          <option value="data_creation">Data Creation</option>
          <option value="results">Results</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" className="flex-1" disabled={!newBlockName.trim()}>
          Update Block
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Add Dependency Form Component
function AddDependencyForm({ 
  currentNodeId,
  experimentNodes,
  onSubmit, 
  onCancel
}: { 
  currentNodeId: string
  experimentNodes: ExperimentNode[]
  onSubmit: (to_node_id: string, dependency_type: string) => void
  onCancel: () => void
}) {
  const [to_node_id, setToNodeId] = useState('')
  const [dependency_type, setDependencyType] = useState('requires')

  // Filter out current node and nodes that already have a dependency from current node
  const availableNodes = experimentNodes.filter(node => 
    node.id !== currentNodeId
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (to_node_id && dependency_type) {
      onSubmit(to_node_id, dependency_type)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Dependency Type</label>
        <select
          value={dependency_type}
          onChange={(e) => setDependencyType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="requires">Requires</option>
          <option value="uses_output">Uses Output</option>
          <option value="follows">Follows</option>
          <option value="validates">Validates</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Target Node</label>
        <select
          value={to_node_id}
          onChange={(e) => setToNodeId(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="">Select a node...</option>
          {availableNodes.map(node => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!to_node_id || !dependency_type} className="flex-1">
          Add Dependency
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Edit Dependency Form Component
function EditDependencyForm({ 
  dependency,
  currentNodeId,
  experimentNodes,
  onSubmit, 
  onCancel
}: { 
  dependency: NonNullable<ExperimentNode['dependencies']>[0]
  currentNodeId: string
  experimentNodes: ExperimentNode[]
  onSubmit: (to_node_id: string, dependency_type: string) => void
  onCancel: () => void
}) {
  const [to_node_id, setToNodeId] = useState(dependency?.to_node_id || '')
  const [dependency_type, setDependencyType] = useState(dependency?.dependency_type || 'requires')

  // Filter out current node
  const availableNodes = experimentNodes.filter(node => 
    node.id !== currentNodeId
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (to_node_id && dependency_type) {
      onSubmit(to_node_id, dependency_type)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Dependency Type</label>
        <select
          value={dependency_type}
          onChange={(e) => setDependencyType(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="requires">Requires</option>
          <option value="uses_output">Uses Output</option>
          <option value="follows">Follows</option>
          <option value="validates">Validates</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Target Node</label>
        <select
          value={to_node_id}
          onChange={(e) => setToNodeId(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="">Select a node...</option>
          {availableNodes.map(node => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </div>
      
      <div className="flex space-x-3 pt-4">
        <Button type="submit" disabled={!to_node_id || !dependency_type} className="flex-1">
          Update Dependency
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
