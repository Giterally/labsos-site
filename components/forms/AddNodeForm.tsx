"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { PlusIcon } from "@heroicons/react/24/outline"
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

interface AddNodeFormProps {
  treeId: string
  nodes: TreeNode[]
  onNodeAdded: (node: any) => void
}

export default function AddNodeForm({ treeId, nodes, onNodeAdded }: AddNodeFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    node_type: "data" as "data" | "software_completed" | "software_development" | "results" | "protocols" | "final_outputs"
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      // Calculate position (add to end of list)
      const position = nodes.length

      const response = await fetch(`/api/trees/${treeId}/nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...formData,
          position: position
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create node')
      }

      const { node } = await response.json()
      onNodeAdded(node)
      setOpen(false)
      setFormData({
        name: "",
        description: "",
        node_type: "data"
      })
    } catch (err: any) {
      setError(err.message || "Failed to create node")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Step
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Experiment Step</DialogTitle>
          <DialogDescription>
            Add a new step to your experiment workflow.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Step Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Step Name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe this step..."
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="node_type">Step Type</Label>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Step"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
