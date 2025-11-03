'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ORCIDProfileChanges } from '@/lib/types'
import { supabase } from '@/lib/supabase-client'

interface ORCIDProfilePreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileChanges: ORCIDProfileChanges
  publicationCount: number
  profileId: string
  onApplyComplete: () => void
}

export function ORCIDProfilePreview({
  open,
  onOpenChange,
  profileChanges,
  publicationCount,
  profileId,
  onApplyComplete
}: ORCIDProfilePreviewProps) {
  const [selectedFields, setSelectedFields] = useState<Set<keyof ORCIDProfileChanges>>(new Set())
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-select all fields when dialog opens with profile changes
  useEffect(() => {
    if (open && Object.keys(profileChanges).length > 0) {
      const allFields = Object.keys(profileChanges) as Array<keyof ORCIDProfileChanges>
      setSelectedFields(new Set(allFields))
    } else if (!open) {
      // Reset when dialog closes
      setSelectedFields(new Set())
    }
  }, [open, profileChanges])

  const fieldLabels: Record<keyof ORCIDProfileChanges, string> = {
    bio: 'Bio',
    institution: 'Institution',
    department: 'Department',
    website: 'Website',
    linkedin: 'LinkedIn',
    github: 'GitHub'
  }

  const toggleField = (field: keyof ORCIDProfileChanges) => {
    const newSelected = new Set(selectedFields)
    if (newSelected.has(field)) {
      newSelected.delete(field)
    } else {
      newSelected.add(field)
    }
    setSelectedFields(newSelected)
  }

  const handleApply = async () => {
    // If there are no profile changes, just close (publications are already imported)
    if (Object.keys(profileChanges).length === 0) {
      onApplyComplete()
      return
    }

    if (selectedFields.size === 0) {
      setError('Please select at least one field to apply')
      return
    }

    setApplying(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Build selected changes object
      const selectedChanges: ORCIDProfileChanges = {}
      selectedFields.forEach(field => {
        if (profileChanges[field]) {
          selectedChanges[field] = profileChanges[field]
        }
      })

      const response = await fetch('/api/orcid/import/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          profileId,
          changes: selectedChanges
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply profile changes')
      }

      onApplyComplete()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review ORCID Import</DialogTitle>
          <DialogDescription>
            Review the profile changes and publications that will be imported from ORCID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Publication Summary */}
          {publicationCount > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">
                Publications: <span className="font-bold">{publicationCount}</span> publication{publicationCount !== 1 ? 's' : ''} {publicationCount > 0 ? 'imported' : 'will be imported'}
              </p>
            </div>
          )}

          {/* Profile Changes */}
          {Object.keys(profileChanges).length === 0 ? (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                No profile changes detected from ORCID.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Profile Changes</Label>
              {(Object.keys(profileChanges) as Array<keyof ORCIDProfileChanges>).map((field) => {
                const value = profileChanges[field]
                if (!value) return null

                const isSelected = selectedFields.has(field)
                const isMerge = field === 'bio' && value.includes('[From ORCID]')

                return (
                  <div key={field} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={field}
                        checked={isSelected}
                        onCheckedChange={() => toggleField(field)}
                      />
                      <Label htmlFor={field} className="font-medium cursor-pointer">
                        {fieldLabels[field]}
                        {isMerge && <span className="ml-2 text-xs text-muted-foreground">(merged)</span>}
                      </Label>
                    </div>
                    <div className="pl-6 text-sm space-y-1">
                      {isMerge ? (
                        <div>
                          <p className="text-muted-foreground mb-1">Merged preview:</p>
                          <p className="whitespace-pre-wrap">{value}</p>
                        </div>
                      ) : (
                        <p className="text-foreground">{value}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {Object.keys(profileChanges).length > 0 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
                Cancel
              </Button>
              <Button 
                onClick={handleApply} 
                disabled={applying || selectedFields.size === 0}
              >
                {applying ? 'Applying...' : `Apply Selected Changes (${selectedFields.size})`}
              </Button>
            </>
          ) : (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? 'Closing...' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


