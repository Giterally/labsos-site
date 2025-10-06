"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ArrowLeftIcon, PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"

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
  
  const [experimentNodes, setExperimentNodes] = useState<ExperimentNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [treeInfo, setTreeInfo] = useState<{name: string, description: string, status: string, category: string} | null>(null)
  const [projectInfo, setProjectInfo] = useState<{name: string, description: string} | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editing, setEditing] = useState(false)
  
  // Track which block to add nodes to
  const [targetBlockForNewNode, setTargetBlockForNewNode] = useState<string | null>(null)
  
  // Tab editing states
  const [editingContent, setEditingContent] = useState(false)
  const [editingAttachments, setEditingAttachments] = useState(false)
  const [editingLinks, setEditingLinks] = useState(false)
  const [editingMetadata, setEditingMetadata] = useState(false)
  
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
  const [blockOrder, setBlockOrder] = useState<string[]>([])
  const [nodeOrder, setNodeOrder] = useState<Record<string, string[]>>({})
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{type: 'block' | 'node', id: string, blockType?: string} | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{type: 'block' | 'node', id: string, blockType?: string} | null>(null)
  
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
    // Use custom name if available, otherwise fall back to default
    if (blockNames[nodeType]) {
      return blockNames[nodeType]
    }
    
    switch (nodeType) {
      case 'protocol': return 'Protocols'
      case 'analysis': return 'Analysis'
      case 'data_creation': return 'Data Creation'
      case 'results': return 'Results'
      default: return nodeType.charAt(0).toUpperCase() + nodeType.slice(1)
    }
  }

  const getBlockIcon = (nodeType: string) => {
    // Check if this is a custom block and get its block_type
    const customBlock = customBlocks.find(block => block.id === nodeType)
    const actualBlockType = customBlock ? customBlock.block_type : nodeType
    
    switch (actualBlockType) {
      case 'protocol': return '📋'
      case 'analysis': return '🔬'
      case 'data_creation': return '📊'
      case 'results': return '📈'
      case 'custom': return '📄'
      default: 
        // Fallback for any other types
        return '📄'
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
        // Delete custom block from Supabase
        const response = await fetch(`/api/trees/${treeId}/blocks/${blockType}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete block')
        }

        // Refresh blocks from API instead of updating local state
        const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`)
        if (blocksResponse.ok) {
          const blocksData = await blocksResponse.json()
          setCustomBlocks(blocksData.customBlocks || [])
          
          // Set block names from custom blocks
          const names: Record<string, string> = {}
          blocksData.customBlocks?.forEach((block: any) => {
            names[block.id] = block.name
          })
          setBlockNames(names)
          
          // Set block order
          const order = blocksData.blockOrder?.map((item: any) => item.block_type) || []
          setBlockOrder(order)
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
  }

  // Block reordering
  const handleBlockReorder = async (draggedBlockId: string, targetBlockId: string) => {
    const currentOrder = [...allBlockTypes]
    const draggedIndex = currentOrder.indexOf(draggedBlockId)
    const targetIndex = currentOrder.indexOf(targetBlockId)
    
    if (draggedIndex === -1 || targetIndex === -1) return
    
    // Remove dragged item and insert at target position
    const [draggedItem] = currentOrder.splice(draggedIndex, 1)
    currentOrder.splice(targetIndex, 0, draggedItem)
    
    // Save to Supabase (only custom blocks need to be saved)
    const customBlockOrder = currentOrder.filter((id: string) => customBlocks.some(block => block.id === id))
    
    try {
      const response = await fetch(`/api/trees/${treeId}/blocks/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blockOrder: customBlockOrder
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update block order')
      }
      
      setBlockOrder(customBlockOrder)
    } catch (err) {
      console.error('Error updating block order:', err)
    }
  }

  // Node reordering within same block
  const handleNodeReorder = async (draggedNodeId: string, targetNodeId: string, blockType: string) => {
    const currentOrder = nodeOrder[blockType] || []
    const draggedIndex = currentOrder.indexOf(draggedNodeId)
    const targetIndex = currentOrder.indexOf(targetNodeId)
    
    if (draggedIndex === -1 || targetIndex === -1) return
    
    // Remove dragged item and insert at target position
    const [draggedItem] = currentOrder.splice(draggedIndex, 1)
    currentOrder.splice(targetIndex, 0, draggedItem)
    
    // Update local state
    setNodeOrder(prev => ({
      ...prev,
      [blockType]: currentOrder
    }))
    
    // TODO: Save to Supabase when node ordering API is implemented
  }

  // Move node to different block
  const handleNodeMoveToBlock = async (nodeId: string, targetBlockType: string) => {
    try {
      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
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
        
        // Update node order
        const newNodeOrder: Record<string, string[]> = {}
        nodesData.nodes.forEach((node: ExperimentNode) => {
          if (!newNodeOrder[node.type]) {
            newNodeOrder[node.type] = []
          }
          newNodeOrder[node.type].push(node.id)
        })
        setNodeOrder(newNodeOrder)
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
    const grouped = experimentNodes.reduce((acc, node) => {
      if (!acc[node.type]) {
        acc[node.type] = []
      }
      acc[node.type].push(node)
      return acc
    }, {} as Record<string, ExperimentNode[]>)

    // Add custom blocks to the grouped nodes
    customBlocks.forEach(block => {
      if (!grouped[block.id]) {
        grouped[block.id] = []
      }
    })

    return grouped
  }, [experimentNodes, customBlocks])

  // Get all block types in the desired order
  const allBlockTypes = useMemo(() => {
    const regularBlockTypes = Object.keys(groupedNodes).filter(type => !type.startsWith('custom_') && !customBlocks.some(block => block.id === type))
    const customBlockTypes = blockOrder.filter(id => customBlocks.some(block => block.id === id))
    
    // Combine regular and custom blocks in the correct order
    // Regular blocks come first, then custom blocks in their saved order
    return [...regularBlockTypes, ...customBlockTypes]
  }, [groupedNodes, customBlocks, blockOrder])
  

  // Fetch project information
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch project information')
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

    if (projectId) {
      fetchProjectInfo()
    }
  }, [projectId])

  // Fetch tree information
  useEffect(() => {
    const fetchTreeInfo = async () => {
      try {
        const response = await fetch(`/api/trees/${treeId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch tree information')
        }
        const data = await response.json()
        setTreeInfo({
          name: data.tree.name,
          description: data.tree.description,
          status: data.tree.status,
          category: data.tree.category
        })
      } catch (err) {
        console.error('Error fetching tree info:', err)
      }
    }

    fetchTreeInfo()
  }, [treeId])

  // Fetch blocks and ordering
  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        const response = await fetch(`/api/trees/${treeId}/blocks`)
        if (!response.ok) {
          throw new Error('Failed to fetch blocks')
        }
        const data = await response.json()
        
        setCustomBlocks(data.customBlocks || [])
        
        // Set block names from custom blocks
        const names: Record<string, string> = {}
        data.customBlocks?.forEach((block: any) => {
          names[block.id] = block.name
        })
        setBlockNames(names)
        
        // Set block order
        const order = data.blockOrder?.map((item: any) => item.block_type) || []
        setBlockOrder(order)
      } catch (err) {
        console.error('Error fetching blocks:', err)
      }
    }

    fetchBlocks()
  }, [treeId])

  // Fetch nodes from Supabase
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        setLoading(true)
        
        // For now, no authentication required
        // TODO: Implement proper project ownership and member system
        const response = await fetch(`/api/trees/${treeId}/nodes`)
        if (!response.ok) {
          throw new Error('Failed to fetch nodes')
        }
        const data = await response.json()
        setExperimentNodes(data.nodes)
        
        // Initialize node order for each block type
        const initialNodeOrder: Record<string, string[]> = {}
        data.nodes.forEach((node: ExperimentNode) => {
          if (!initialNodeOrder[node.type]) {
            initialNodeOrder[node.type] = []
          }
          initialNodeOrder[node.type].push(node.id)
        })
        setNodeOrder(initialNodeOrder)
        
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

    fetchNodes()
  }, [treeId])

  // Create new node
  const createNode = async (name: string, description: string, nodeType: string) => {
    try {
      setCreating(true)
      
      // Use target block if specified, otherwise use the provided nodeType
      const actualNodeType = targetBlockForNewNode || nodeType
      
      const requestData = {
        name,
        description,
        node_type: actualNodeType,
        position: experimentNodes.length + 1, // Add at the end
        content: '' // Empty content initially
      }
      
      console.log('Creating node with data:', requestData)
      console.log('Tree ID:', treeId)
      
      const response = await fetch(`/api/trees/${treeId}/nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
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
      const nodesResponse = await fetch(`/api/trees/${treeId}/nodes`)
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json()
        setExperimentNodes(nodesData.nodes)
        
        // Initialize node order for each block type
        const initialNodeOrder: Record<string, string[]> = {}
        nodesData.nodes.forEach((node: ExperimentNode) => {
          if (!initialNodeOrder[node.type]) {
            initialNodeOrder[node.type] = []
          }
          initialNodeOrder[node.type].push(node.id)
        })
        setNodeOrder(initialNodeOrder)
        
        // Select the new node
        setSelectedNodeId(data.node.id)
      }
      
      setShowCreateForm(false)
      setTargetBlockForNewNode(null) // Reset target block
    } catch (err) {
      console.error('Error creating node:', err)
      alert('Failed to create node: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  // Edit node
  const editNode = async (nodeId: string, name: string, description: string, nodeType: string, content?: string) => {
    try {
      setEditing(true)
      
      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          node_type: nodeType,
          content: content || ''
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update node')
      }
      
      // Refresh the nodes list by updating the state
      setExperimentNodes(prev => prev.map(node => 
        node.id === nodeId 
          ? { ...node, title: name, description, type: nodeType, content: content || '' }
          : node
      ))
      setShowEditForm(false)
    } catch (err) {
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}`, {
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
        })
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
      console.error('Error saving content:', err)
      alert('Failed to save content')
    }
  }

  // Attachment management functions
  const addAttachment = async (name: string, fileType: string, fileSize: number, fileUrl: string, description: string) => {
    if (!selectedNode) return
    
    try {
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments/${attachmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/attachments/${attachmentId}`, {
        method: 'DELETE'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links/${linkId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}/links/${linkId}`, {
        method: 'DELETE'
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${selectedNode.id}`, {
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
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to save metadata')
      }
      
      // Update local state
      setExperimentNodes(prev => prev.map(node => 
        node.id === selectedNode.id 
          ? { 
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
          : node
      ))
      
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
      const response = await fetch(`/api/trees/${treeId}/nodes/${nodeId}`, {
        method: 'DELETE'
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
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/project/${projectId}`)}
            className="flex items-center space-x-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Back to {projectInfo?.name || 'Project'}</span>
          </Button>
        </div>

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
                        treeInfo.status === 'active' ? 'bg-green-100 text-green-800' :
                        treeInfo.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        treeInfo.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        'bg-orange-100 text-orange-800'
                      }>
                        {treeInfo.status}
                      </Badge>
                      <Badge variant="outline">
                        {treeInfo.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}
        
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Experiment Steps */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Experiment Steps</CardTitle>
                    <CardDescription>
                      Click on a step to view details
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddBlockForm(true)}
                    className="flex items-center space-x-1"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Add Block</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {experimentNodes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No experiment steps yet.</p>
                      <p className="text-sm">Click "Add" to create your first step.</p>
                    </div>
                  ) : (
                    allBlockTypes.map((nodeType) => {
                      const nodes = groupedNodes[nodeType] || []
                      const isCollapsed = collapsedBlocks.has(nodeType)
                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'completed': return 'bg-green-500'
                          case 'in-progress': return 'bg-orange-500'
                          case 'pending': return 'bg-gray-400'
                          default: return 'bg-blue-500'
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
                            dragOverItem?.type === 'block' && dragOverItem.id === nodeType ? 'border-blue-500 bg-blue-50' : ''
                          }`}
                        >
                          {/* Block Header */}
                          <div className={`px-3 py-2 transition-colors ${
                            isHighlighted ? 'bg-primary/10' : 'bg-muted/30'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div 
                                className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 transition-colors rounded px-1 py-1 -mx-1 -my-1 flex-1"
                                onClick={() => toggleBlock(nodeType)}
                              >
                                <span className="text-lg">{getBlockIcon(nodeType)}</span>
                                <span className="text-sm font-medium">{getBlockTitle(nodeType)}</span>
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
                              <div className="flex items-center space-x-1 ml-2">
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
                            </div>
                          </div>
                          
                          {/* Block Content */}
                          {!isCollapsed && (
                            <div className="p-2 space-y-2">
                              {(nodeOrder[nodeType] ? 
                                nodeOrder[nodeType].map(nodeId => nodes.find(n => n.id === nodeId)).filter((node): node is ExperimentNode => node !== undefined) :
                                nodes
                              ).map((node) => {
                                const isSelected = selectedNodeId === node.id
                                
                                return (
                                  <div 
                                    key={node.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, 'node', node.id, nodeType)}
                                    onDragOver={(e) => handleDragOver(e, 'node', node.id, nodeType)}
                                    onDragLeave={(e) => handleDragLeave(e, 'node')}
                                    onDrop={(e) => handleDrop(e, 'node', node.id, nodeType)}
                                    onDragEnd={handleDragEnd}
                                    className={`border rounded-lg p-3 transition-all duration-200 cursor-move ${
                                      isSelected 
                                        ? 'bg-primary/10 border-primary shadow-md' 
                                        : 'hover:bg-muted/50'
                                    } ${
                                      draggedItem?.type === 'node' && draggedItem.id === node.id ? 'opacity-50' : ''
                                    } ${
                                      dragOverItem?.type === 'node' && dragOverItem.id === node.id ? 'border-blue-500 bg-blue-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div 
                                        className="flex items-center space-x-2 cursor-pointer flex-1"
                                        onClick={() => setSelectedNodeId(node.id)}
                                      >
                                        <div className={`w-2 h-2 ${getStatusColor(node.status)} rounded-full`}></div>
                                        <span className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                                          {node.title}
                                        </span>
                                      </div>
                                      
                                      {/* Node Management Buttons */}
                                      <div className="flex items-center space-x-1 ml-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
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
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {node.status === 'completed' ? '(Completed)' : node.status === 'in-progress' ? '(In Progress)' : ''}
                                    </p>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tree Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={
                      treeInfo?.status === 'active' ? 'bg-green-100 text-green-800' :
                      treeInfo?.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                      treeInfo?.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-orange-100 text-orange-800'
                    }>
                      {treeInfo?.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <Badge variant="outline">{treeInfo?.category || 'Unknown'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Steps:</span>
                    <span>{experimentNodes.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Node Details */}
          <div className="lg:col-span-3">
            {selectedNode ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedNode.title}</CardTitle>
                      <CardDescription>
                        {selectedNode.description}
                      </CardDescription>
                    </div>
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
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Content</h4>
                          {!editingContent && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={startEditingContent}
                              className="flex items-center space-x-1"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span>Edit</span>
                            </Button>
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
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Attachments</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingAttachments(!editingAttachments)}
                            className="flex items-center space-x-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            <span>{editingAttachments ? 'Done' : 'Edit'}</span>
                          </Button>
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
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Links</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingLinks(!editingLinks)}
                            className="flex items-center space-x-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            <span>{editingLinks ? 'Done' : 'Edit'}</span>
                          </Button>
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
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Metadata</h4>
                          {!editingMetadata && (
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
                                    <span>{selectedNode.metadata.position}</span>
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
              onSubmit={(name, description, nodeType, content) => 
                editNode(selectedNode.id, name, description, nodeType, content)
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
                  const response = await fetch(`/api/trees/${treeId}/blocks`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
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
                  const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`)
                  if (blocksResponse.ok) {
                    const blocksData = await blocksResponse.json()
                    setCustomBlocks(blocksData.customBlocks || [])
                    
                    // Set block names from custom blocks
                    const names: Record<string, string> = {}
                    blocksData.customBlocks?.forEach((block: any) => {
                      names[block.id] = block.name
                    })
                    setBlockNames(names)
                    
                    // Set block order
                    const order = blocksData.blockOrder?.map((item: any) => item.block_type) || []
                    setBlockOrder(order)
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
              onSubmit={async (newBlockName) => {
                try {
                  if (!editingBlockType) return

                  const response = await fetch(`/api/trees/${treeId}/blocks/${editingBlockType}`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      name: newBlockName
                    }),
                  })

                  if (!response.ok) {
                    throw new Error('Failed to update block')
                  }

                  // Refresh blocks from API instead of updating local state
                  const blocksResponse = await fetch(`/api/trees/${treeId}/blocks`)
                  if (blocksResponse.ok) {
                    const blocksData = await blocksResponse.json()
                    setCustomBlocks(blocksData.customBlocks || [])
                    
                    // Set block names from custom blocks
                    const names: Record<string, string> = {}
                    blocksData.customBlocks?.forEach((block: any) => {
                      names[block.id] = block.name
                    })
                    setBlockNames(names)
                    
                    // Set block order
                    const order = blocksData.blockOrder?.map((item: any) => item.block_type) || []
                    setBlockOrder(order)
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
    </div>
  )
}

// Create Node Form Component
function CreateNodeForm({ 
  onSubmit, 
  onCancel, 
  loading 
}: { 
  onSubmit: (name: string, description: string, nodeType: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nodeType, setNodeType] = useState('protocol')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim(), description.trim(), nodeType)
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
          <option value="data_collection">Data Collection</option>
          <option value="results">Results</option>
        </select>
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
  onSubmit, 
  onCancel, 
  loading 
}: { 
  node: ExperimentNode
  onSubmit: (name: string, description: string, nodeType: string, content: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState(node.title)
  const [description, setDescription] = useState(node.description)
  const [nodeType, setNodeType] = useState(node.type)
  const [content, setContent] = useState(node.content)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim(), description.trim(), nodeType, content)
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
          <option value="data_collection">Data Collection</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter node content"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          rows={4}
        />
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
  onSave, 
  onCancel
}: { 
  metadata: ExperimentNode['metadata']
  status: string
  onSave: (type: string, position: number, status: string) => void
  onCancel: () => void
}) {
  const [nodeType, setNodeType] = useState(metadata.type)
  const [position, setPosition] = useState(metadata.position)
  const [nodeStatus, setNodeStatus] = useState(status)

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
          <option value="data_collection">Data Collection</option>
          <option value="results">Results</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Position</label>
        <input
          type="number"
          value={position}
          onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
          min="1"
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
  onSubmit, 
  onCancel
}: { 
  blockType: string
  onSubmit: (newBlockName: string) => void
  onCancel: () => void
}) {
  const [newBlockName, setNewBlockName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newBlockName.trim()) {
      onSubmit(newBlockName.trim())
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
          placeholder="Enter new block name"
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
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
