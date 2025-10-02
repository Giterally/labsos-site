"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase-client"

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

interface EditNodeFormProps {
  node: TreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onNodeUpdated: (node: TreeNode) => void
}

export default function EditNodeForm({ node, open, onOpenChange, onNodeUpdated }: EditNodeFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    node_type: "data" as "data" | "software_completed" | "software_development" | "results" | "protocols" | "final_outputs"
  })

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name,
        description: node.description || "",
        node_type: node.node_type
      })
    }
  }, [node])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!node) return

    setLoading(true)
    setError(null)

    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/trees/${node.tree_id}/nodes/${node.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update node')
      }

      const { node: updatedNode } = await response.json()
      onNodeUpdated(updatedNode)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update node")
    } finally {
      setLoading(false)
    }
  }

  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Node</DialogTitle>
          <DialogDescription>
            Update the details for "{node.name}".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Node Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Node Name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe this node..."
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="node_type">Node Type</Label>
            <Select value={formData.node_type} onValueChange={(value: any) => setFormData({ ...formData, node_type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data">Data</SelectItem>
                <SelectItem value="software_completed">Software (Completed)</SelectItem>
                <SelectItem value="software_development">Software (Development)</SelectItem>
                <SelectItem value="results">Results</SelectItem>
                <SelectItem value="protocols">Protocols</SelectItem>
                <SelectItem value="final_outputs">Final Outputs</SelectItem>
              </SelectContent>
            </Select>
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
              {loading ? "Updating..." : "Update Node"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
