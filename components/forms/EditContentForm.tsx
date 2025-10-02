"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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

interface EditContentFormProps {
  node: TreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onContentUpdated: (content: string) => void
}

export default function EditContentForm({ node, open, onOpenChange, onContentUpdated }: EditContentFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState("")

  useEffect(() => {
    if (node) {
      setContent(node.description || "")
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

      const response = await fetch(`/api/trees/${node.tree_id}/nodes/${node.id}/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: content }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update content')
      }

      onContentUpdated(content)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update content")
    } finally {
      setLoading(false)
    }
  }

  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Content</DialogTitle>
          <DialogDescription>
            Update the content for "{node.name}".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter detailed content for this step..."
              rows={10}
              className="resize-none"
            />
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
              {loading ? "Updating..." : "Update Content"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
