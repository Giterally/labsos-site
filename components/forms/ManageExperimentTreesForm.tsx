"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { PencilIcon, TrashIcon, PlusIcon } from "@heroicons/react/24/outline"

interface ManageExperimentTreesFormProps {
  projectId: string
  trees: Array<{
    id: string
    name: string
    description: string
    category: string
    status: string
    node_types: {
      protocol: number
      data: number
      analysis: number
      result: number
    }
  }>
  onTreesUpdated: (updatedTrees: any[]) => void
}

export default function ManageExperimentTreesForm({ projectId, trees, onTreesUpdated }: ManageExperimentTreesFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingTree, setEditingTree] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'experiment',
    status: 'active'
  })

  const handleEditTree = (tree: any) => {
    setEditingTree(tree)
    setFormData({
      name: tree.name,
      description: tree.description,
      category: tree.category,
      status: tree.status
    })
  }

  const handleSaveTree = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingTree) {
        // Update existing tree
        const updatedTrees = trees.map(tree => 
          tree.id === editingTree.id 
            ? { ...tree, ...formData }
            : tree
        )
        onTreesUpdated(updatedTrees)
      } else {
        // Add new tree
        const newTree = {
          id: Date.now().toString(),
          ...formData,
          node_types: { protocol: 0, data: 0, analysis: 0, result: 0 }
        }
        onTreesUpdated([...trees, newTree])
      }
      
      setEditingTree(null)
      setFormData({ name: '', description: '', category: 'experiment', status: 'active' })
    } catch (error) {
      console.error('Error saving tree:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTree = async (treeId: string) => {
    try {
      onTreesUpdated(trees.filter(tree => tree.id !== treeId))
    } catch (error) {
      console.error('Error deleting tree:', error)
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'experiment': return 'bg-blue-100 text-blue-800'
      case 'analysis': return 'bg-green-100 text-green-800'
      case 'protocol': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'archived': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon className="h-4 w-4 mr-2" />
          Manage Trees
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Experiment Trees</DialogTitle>
          <DialogDescription>
            Edit, delete, or add new experiment trees for this project.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Add/Edit Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingTree ? 'Edit Tree' : 'Add New Tree'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveTree} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Tree Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="experiment">Experiment</SelectItem>
                        <SelectItem value="analysis">Analysis</SelectItem>
                        <SelectItem value="protocol">Protocol</SelectItem>
                        <SelectItem value="workflow">Workflow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex justify-end space-x-2">
                  {editingTree && (
                    <Button type="button" variant="outline" onClick={() => setEditingTree(null)}>
                      Cancel Edit
                    </Button>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : editingTree ? 'Update Tree' : 'Add Tree'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Trees List */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Current Trees</h3>
            {trees.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No experiment trees yet</p>
            ) : (
              trees.map((tree) => (
                <Card key={tree.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-medium">{tree.name}</h4>
                          <Badge className={getCategoryColor(tree.category)}>
                            {tree.category}
                          </Badge>
                          <Badge className={getStatusColor(tree.status)}>
                            {tree.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{tree.description}</p>
                        <div className="flex space-x-4 mt-2 text-xs text-muted-foreground">
                          <span>Protocols: {tree.node_types.protocol}</span>
                          <span>Data: {tree.node_types.data}</span>
                          <span>Analysis: {tree.node_types.analysis}</span>
                          <span>Results: {tree.node_types.result}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTree(tree)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTree(tree.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
