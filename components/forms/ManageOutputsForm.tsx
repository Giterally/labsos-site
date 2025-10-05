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
import { PencilIcon, TrashIcon, PlusIcon, DocumentTextIcon } from "@heroicons/react/24/outline"

interface ManageOutputsFormProps {
  projectId: string
  outputs: Array<{
    id: string
    title: string
    description: string
    type: string
    status: string
    publication_date?: string
    doi?: string
    url?: string
  }>
  onOutputsUpdated: (updatedOutputs: any[]) => void
}

export default function ManageOutputsForm({ projectId, outputs, onOutputsUpdated }: ManageOutputsFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingOutput, setEditingOutput] = useState<any>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'publication',
    status: 'draft',
    publication_date: '',
    doi: '',
    url: ''
  })

  const handleEditOutput = (output: any) => {
    setEditingOutput(output)
    setFormData({
      title: output.title,
      description: output.description,
      type: output.type,
      status: output.status,
      publication_date: output.publication_date || '',
      doi: output.doi || '',
      url: output.url || ''
    })
  }

  const handleSaveOutput = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingOutput) {
        // Update existing output
        const updatedOutputs = outputs.map(output => 
          output.id === editingOutput.id 
            ? { ...output, ...formData }
            : output
        )
        onOutputsUpdated(updatedOutputs)
      } else {
        // Add new output
        const newOutput = {
          id: Date.now().toString(),
          ...formData
        }
        onOutputsUpdated([...outputs, newOutput])
      }
      
      setEditingOutput(null)
      setFormData({ title: '', description: '', type: 'publication', status: 'draft', publication_date: '', doi: '', url: '' })
    } catch (error) {
      console.error('Error saving output:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteOutput = async (outputId: string) => {
    try {
      onOutputsUpdated(outputs.filter(output => output.id !== outputId))
    } catch (error) {
      console.error('Error deleting output:', error)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'publication': return 'bg-blue-100 text-blue-800'
      case 'dataset': return 'bg-green-100 text-green-800'
      case 'software': return 'bg-purple-100 text-purple-800'
      case 'presentation': return 'bg-orange-100 text-orange-800'
      case 'report': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800'
      case 'submitted': return 'bg-yellow-100 text-yellow-800'
      case 'draft': return 'bg-gray-100 text-gray-800'
      case 'under_review': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DocumentTextIcon className="h-4 w-4 mr-2" />
          Manage Outputs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Research Outputs</DialogTitle>
          <DialogDescription>
            Add, edit, or remove research outputs like publications, datasets, and software.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Add/Edit Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingOutput ? 'Edit Output' : 'Add New Output'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveOutput} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="publication">Publication</SelectItem>
                        <SelectItem value="dataset">Dataset</SelectItem>
                        <SelectItem value="software">Software</SelectItem>
                        <SelectItem value="presentation">Presentation</SelectItem>
                        <SelectItem value="report">Report</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
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
                    placeholder="Describe the research output and its significance"
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publication_date">Publication Date</Label>
                    <Input
                      id="publication_date"
                      type="date"
                      value={formData.publication_date}
                      onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doi">DOI</Label>
                    <Input
                      id="doi"
                      value={formData.doi}
                      onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                      placeholder="10.1000/182"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  {editingOutput && (
                    <Button type="button" variant="outline" onClick={() => setEditingOutput(null)}>
                      Cancel Edit
                    </Button>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : editingOutput ? 'Update Output' : 'Add Output'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Outputs List */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Current Research Outputs</h3>
            {outputs.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No research outputs yet</p>
            ) : (
              outputs.map((output) => (
                <Card key={output.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-medium">{output.title}</h4>
                          <Badge className={getTypeColor(output.type)}>
                            {output.type}
                          </Badge>
                          <Badge className={getStatusColor(output.status)}>
                            {output.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{output.description}</p>
                        <div className="flex space-x-4 text-xs text-muted-foreground">
                          {output.publication_date && (
                            <span>Published: {new Date(output.publication_date).toLocaleDateString()}</span>
                          )}
                          {output.doi && (
                            <span>DOI: {output.doi}</span>
                          )}
                          {output.url && (
                            <a 
                              href={output.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              View
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditOutput(output)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOutput(output.id)}
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
