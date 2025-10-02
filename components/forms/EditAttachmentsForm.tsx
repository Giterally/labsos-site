"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrashIcon, PlusIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { isVideoUrl, detectVideoType, getVideoPreviewInfo } from "@/lib/video-utils"

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

interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size?: number
}

interface EditAttachmentsFormProps {
  node: TreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAttachmentsUpdated: (attachments: Attachment[]) => void
}

export default function EditAttachmentsForm({ node, open, onOpenChange, onAttachmentsUpdated }: EditAttachmentsFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [newAttachment, setNewAttachment] = useState({ name: '', url: '', type: 'file' })
  const [urlPreview, setUrlPreview] = useState<{ isValid: boolean; type?: string; message?: string } | null>(null)

  useEffect(() => {
    if (node) {
      // For now, we'll start with empty attachments
      // In the future, this could fetch from a separate attachments table
      setAttachments([])
    }
  }, [node])

  const detectAttachmentType = (url: string) => {
    if (isVideoUrl(url)) {
      const videoInfo = detectVideoType(url)
      return videoInfo.type === 'youtube' ? 'youtube' : 
             videoInfo.type === 'vimeo' ? 'vimeo' : 
             'video'
    }
    
    // Check for other file types
    if (url.includes('.pdf')) return 'pdf'
    if (url.includes('.doc') || url.includes('.docx')) return 'document'
    if (url.includes('.xls') || url.includes('.xlsx')) return 'spreadsheet'
    if (url.includes('.ppt') || url.includes('.pptx')) return 'presentation'
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image'
    if (url.match(/\.(zip|rar|7z|tar|gz)$/i)) return 'archive'
    
    return 'file'
  }

  const handleUrlChange = (url: string) => {
    setNewAttachment({ ...newAttachment, url })
    
    if (url.trim()) {
      const preview = getVideoPreviewInfo(url)
      setUrlPreview(preview)
    } else {
      setUrlPreview(null)
    }
  }

  const addAttachment = () => {
    if (newAttachment.name && newAttachment.url) {
      const detectedType = detectAttachmentType(newAttachment.url)
      const attachment: Attachment = {
        id: Date.now().toString(),
        name: newAttachment.name,
        url: newAttachment.url,
        type: detectedType,
      }
      setAttachments([...attachments, attachment])
      setNewAttachment({ name: '', url: '', type: 'file' })
      setUrlPreview(null)
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(att => att.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!node) return

    setLoading(true)
    setError(null)

    try {
      // For now, we'll just update the attachments in state
      // In the future, this could save to a separate attachments table
      onAttachmentsUpdated(attachments)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update attachments")
    } finally {
      setLoading(false)
    }
  }

  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Attachments</DialogTitle>
          <DialogDescription>
            Manage files and media for "{node.name}". Video URLs will be automatically detected and embedded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Add new attachment */}
          <div className="space-y-2">
            <Label>Add New Attachment</Label>
            <div className="space-y-2">
              <Input
                placeholder="Attachment name"
                value={newAttachment.name}
                onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
              />
              <div className="space-y-1">
                <Input
                  placeholder="URL (supports videos, documents, images, etc.)"
                  value={newAttachment.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
                {urlPreview && (
                  <div className={`flex items-center space-x-2 text-sm ${
                    urlPreview.isValid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {urlPreview.isValid ? (
                      <CheckCircleIcon className="h-4 w-4" />
                    ) : (
                      <ExclamationTriangleIcon className="h-4 w-4" />
                    )}
                    <span>{urlPreview.message}</span>
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <select
                  value={newAttachment.type}
                  onChange={(e) => setNewAttachment({ ...newAttachment, type: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="file">File</option>
                  <option value="video">Video</option>
                  <option value="youtube">YouTube</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="image">Image</option>
                  <option value="document">Document</option>
                  <option value="pdf">PDF</option>
                  <option value="archive">Archive</option>
                </select>
                <Button 
                  type="button" 
                  onClick={addAttachment} 
                  size="sm"
                  disabled={!newAttachment.name || !newAttachment.url || (urlPreview && !urlPreview.isValid)}
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Current attachments */}
          <div className="space-y-2">
            <Label>Current Attachments</Label>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments yet.</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <Card key={attachment.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{attachment.type}</Badge>
                          <span className="text-sm font-medium">{attachment.name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(attachment.id)}
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
              {loading ? "Updating..." : "Update Attachments"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
