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
import { PencilIcon, TrashIcon, PlusIcon, CodeBracketIcon } from "@heroicons/react/24/outline"

interface ManageSoftwareFormProps {
  projectId: string
  software: Array<{
    id: string
    name: string
    description: string
    version: string
    type: string
    repository_url?: string
    documentation_url?: string
  }>
  onSoftwareUpdated: (updatedSoftware: any[]) => void
}

export default function ManageSoftwareForm({ projectId, software, onSoftwareUpdated }: ManageSoftwareFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingSoftware, setEditingSoftware] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: '',
    type: 'library',
    repository_url: '',
    documentation_url: ''
  })

  const handleEditSoftware = (item: any) => {
    setEditingSoftware(item)
    setFormData({
      name: item.name,
      description: item.description,
      version: item.version,
      type: item.type,
      repository_url: item.repository_url || '',
      documentation_url: item.documentation_url || ''
    })
  }

  const handleSaveSoftware = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingSoftware) {
        // Update existing software
        const updatedSoftware = software.map(item => 
          item.id === editingSoftware.id 
            ? { ...item, ...formData }
            : item
        )
        onSoftwareUpdated(updatedSoftware)
      } else {
        // Add new software
        const newSoftware = {
          id: Date.now().toString(),
          ...formData
        }
        onSoftwareUpdated([...software, newSoftware])
      }
      
      setEditingSoftware(null)
      setFormData({ name: '', description: '', version: '', type: 'library', repository_url: '', documentation_url: '' })
    } catch (error) {
      console.error('Error saving software:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSoftware = async (softwareId: string) => {
    try {
      onSoftwareUpdated(software.filter(item => item.id !== softwareId))
    } catch (error) {
      console.error('Error deleting software:', error)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'library': return 'bg-blue-100 text-blue-800'
      case 'framework': return 'bg-green-100 text-green-800'
      case 'tool': return 'bg-purple-100 text-purple-800'
      case 'database': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CodeBracketIcon className="h-4 w-4 mr-2" />
          Manage Software
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Software & Tools</DialogTitle>
          <DialogDescription>
            Add, edit, or remove software and tools used in this project.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Add/Edit Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingSoftware ? 'Edit Software' : 'Add New Software'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSoftware} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Software Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="version">Version</Label>
                    <Input
                      id="version"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      placeholder="e.g., 1.0.0"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="library">Library</SelectItem>
                      <SelectItem value="framework">Framework</SelectItem>
                      <SelectItem value="tool">Tool</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Describe what this software does and how it's used in the project"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="repository_url">Repository URL</Label>
                    <Input
                      id="repository_url"
                      type="url"
                      value={formData.repository_url}
                      onChange={(e) => setFormData({ ...formData, repository_url: e.target.value })}
                      placeholder="https://github.com/user/repo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="documentation_url">Documentation URL</Label>
                    <Input
                      id="documentation_url"
                      type="url"
                      value={formData.documentation_url}
                      onChange={(e) => setFormData({ ...formData, documentation_url: e.target.value })}
                      placeholder="https://docs.example.com"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  {editingSoftware && (
                    <Button type="button" variant="outline" onClick={() => setEditingSoftware(null)}>
                      Cancel Edit
                    </Button>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : editingSoftware ? 'Update Software' : 'Add Software'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Software List */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Current Software & Tools</h3>
            {software.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No software added yet</p>
            ) : (
              software.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-medium">{item.name}</h4>
                          {item.version && (
                            <Badge variant="outline">v{item.version}</Badge>
                          )}
                          <Badge className={getTypeColor(item.type)}>
                            {item.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                        <div className="flex space-x-4 text-xs">
                          {item.repository_url && (
                            <a 
                              href={item.repository_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Repository
                            </a>
                          )}
                          {item.documentation_url && (
                            <a 
                              href={item.documentation_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Documentation
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSoftware(item)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSoftware(item.id)}
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
