"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrashIcon, PlusIcon, LinkIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline"
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

interface Link {
  id: string
  name: string
  url: string
  type: 'github' | 'documentation' | 'paper' | 'youtube' | 'vimeo' | 'video' | 'other'
}

interface EditLinksFormProps {
  node: TreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinksUpdated: (links: Link[]) => void
}

export default function EditLinksForm({ node, open, onOpenChange, onLinksUpdated }: EditLinksFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [newLink, setNewLink] = useState({ name: '', url: '', type: 'other' as const })
  const [urlPreview, setUrlPreview] = useState<{ isValid: boolean; type?: string; message?: string } | null>(null)

  useEffect(() => {
    if (node) {
      // For now, we'll start with empty links
      // In the future, this could fetch from a separate links table
      setLinks([])
    }
  }, [node])

  const detectLinkType = (url: string) => {
    if (isVideoUrl(url)) {
      const videoInfo = detectVideoType(url)
      return videoInfo.type === 'youtube' ? 'youtube' : 
             videoInfo.type === 'vimeo' ? 'vimeo' : 
             'video'
    }
    
    // Check for other link types
    if (url.includes('github.com')) return 'github'
    if (url.includes('docs.') || url.includes('documentation')) return 'documentation'
    if (url.includes('arxiv.org') || url.includes('scholar.google')) return 'paper'
    
    return 'other'
  }

  const handleUrlChange = (url: string) => {
    setNewLink({ ...newLink, url })
    
    if (url.trim()) {
      const preview = getVideoPreviewInfo(url)
      setUrlPreview(preview)
    } else {
      setUrlPreview(null)
    }
  }

  const addLink = () => {
    if (newLink.name && newLink.url) {
      const detectedType = detectLinkType(newLink.url)
      const link: Link = {
        id: Date.now().toString(),
        name: newLink.name,
        url: newLink.url,
        type: detectedType,
      }
      setLinks([...links, link])
      setNewLink({ name: '', url: '', type: 'other' })
      setUrlPreview(null)
    }
  }

  const removeLink = (id: string) => {
    setLinks(links.filter(link => link.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!node) return

    setLoading(true)
    setError(null)

    try {
      // For now, we'll just update the links in state
      // In the future, this could save to a separate links table
      onLinksUpdated(links)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update links")
    } finally {
      setLoading(false)
    }
  }

  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Links</DialogTitle>
          <DialogDescription>
            Manage external links for "{node.name}". Video links will be automatically detected and embedded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Add new link */}
          <div className="space-y-2">
            <Label>Add New Link</Label>
            <div className="space-y-2">
              <Input
                placeholder="Link name (e.g., GitHub Repository, Video Tutorial)"
                value={newLink.name}
                onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
              />
              <div className="space-y-1">
                <Input
                  placeholder="URL"
                  value={newLink.url}
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
                  value={newLink.type}
                  onChange={(e) => setNewLink({ ...newLink, type: e.target.value as any })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="github">GitHub</option>
                  <option value="documentation">Documentation</option>
                  <option value="paper">Paper</option>
                  <option value="youtube">YouTube</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="video">Video</option>
                  <option value="other">Other</option>
                </select>
                <Button 
                  type="button" 
                  onClick={addLink} 
                  size="sm"
                  disabled={!newLink.name || !newLink.url}
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Current links */}
          <div className="space-y-2">
            <Label>Current Links</Label>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet.</p>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <Card key={link.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline">{link.type}</Badge>
                          <span className="text-sm font-medium">{link.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLink(link.id)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
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
              {loading ? "Updating..." : "Update Links"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
