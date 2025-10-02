"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline"

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

interface MetadataField {
  id: string
  key: string
  value: string
  type: 'text' | 'number' | 'boolean' | 'json'
}

interface EditMetadataFormProps {
  node: TreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMetadataUpdated: (metadata: MetadataField[]) => void
}

export default function EditMetadataForm({ node, open, onOpenChange, onMetadataUpdated }: EditMetadataFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<MetadataField[]>([])
  const [newField, setNewField] = useState({ key: '', value: '', type: 'text' as const })

  useEffect(() => {
    if (node) {
      // Initialize with some default metadata fields
      setMetadata([
        {
          id: '1',
          key: 'node_type',
          value: node.node_type,
          type: 'text'
        },
        {
          id: '2',
          key: 'position',
          value: node.position?.toString() || '0',
          type: 'number'
        },
        {
          id: '3',
          key: 'created_at',
          value: new Date(node.created_at).toISOString(),
          type: 'text'
        }
      ])
    }
  }, [node])

  const addField = () => {
    if (newField.key && newField.value) {
      const field: MetadataField = {
        id: Date.now().toString(),
        key: newField.key,
        value: newField.value,
        type: newField.type,
      }
      setMetadata([...metadata, field])
      setNewField({ key: '', value: '', type: 'text' })
    }
  }

  const removeField = (id: string) => {
    setMetadata(metadata.filter(field => field.id !== id))
  }

  const updateField = (id: string, key: string, value: string) => {
    setMetadata(metadata.map(field => 
      field.id === id ? { ...field, key, value } : field
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!node) return

    setLoading(true)
    setError(null)

    try {
      // For now, we'll just update the metadata in state
      // In the future, this could save to a separate metadata table
      onMetadataUpdated(metadata)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update metadata")
    } finally {
      setLoading(false)
    }
  }

  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Metadata</DialogTitle>
          <DialogDescription>
            Manage technical metadata for "{node.name}".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Add new field */}
          <div className="space-y-2">
            <Label>Add New Field</Label>
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Input
                  placeholder="Field name"
                  value={newField.key}
                  onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                />
                <select
                  value={newField.type}
                  onChange={(e) => setNewField({ ...newField, type: e.target.value as any })}
                  className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="json">JSON</option>
                </select>
              </div>
              <div className="flex space-x-2">
                <Input
                  placeholder="Field value"
                  value={newField.value}
                  onChange={(e) => setNewField({ ...newField, value: e.target.value })}
                />
                <Button type="button" onClick={addField} size="sm">
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Current metadata */}
          <div className="space-y-2">
            <Label>Current Metadata</Label>
            {metadata.length === 0 ? (
              <p className="text-sm text-muted-foreground">No metadata fields yet.</p>
            ) : (
              <div className="space-y-2">
                {metadata.map((field) => (
                  <Card key={field.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{field.type}</Badge>
                        <Input
                          value={field.key}
                          onChange={(e) => updateField(field.id, e.target.value, field.value)}
                          className="flex-1"
                        />
                        <Input
                          value={field.value}
                          onChange={(e) => updateField(field.id, field.key, e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeField(field.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Metadata"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
