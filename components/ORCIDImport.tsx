'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase-client'
import { ORCIDProfilePreview } from '@/components/ORCIDProfilePreview'
import { ORCIDProfileChanges } from '@/lib/types'

interface ORCIDImportProps {
  profileId: string
  currentORCID?: string
  onImportComplete: () => void
}

export function ORCIDImport({ profileId, currentORCID, onImportComplete }: ORCIDImportProps) {
  const [orcidId, setOrcidId] = useState(currentORCID || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [profileChanges, setProfileChanges] = useState<ORCIDProfileChanges>({})
  const [importedPublications, setImportedPublications] = useState(0)

  // Sync internal state with currentORCID prop when it changes
  useEffect(() => {
    setOrcidId(currentORCID || '')
  }, [currentORCID])

  const handleImport = async () => {
    if (!orcidId.trim()) {
      setError('Please enter an ORCID ID')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/orcid/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orcidId: orcidId.trim(), profileId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import ORCID data')
      }

      // Store the import results
      setImportedPublications(data.importedPublications || 0)
      setProfileChanges(data.profileChanges || {})

      // Show preview dialog if there are profile changes OR publications imported
      // This allows users to review and apply profile changes
      if (Object.keys(data.profileChanges || {}).length > 0 || (data.importedPublications || 0) > 0) {
        setShowPreview(true)
      } else {
        setSuccess('ORCID data processed (no changes to apply)')
        onImportComplete()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const validateORCIDFormat = (id: string) => {
    const pattern = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/
    return pattern.test(id)
  }

  const isValidORCID = orcidId.trim() && validateORCIDFormat(orcidId.trim())

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button 
          onClick={handleImport} 
          disabled={loading || !isValidORCID}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Image src="/orcid-logo.svg" alt="ORCID" width={16} height={16} className="mr-2" />
              Import from ORCID
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          Import publications and profile data from your ORCID profile. You can add your ORCID ID by editing your profile.
        </p>
        {orcidId.trim() && !isValidORCID && (
          <p className="text-sm text-destructive">
            Please enter a valid ORCID ID format (e.g., 0000-0002-1825-0097) in the field above
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <ORCIDProfilePreview
        open={showPreview}
        onOpenChange={(open) => {
          setShowPreview(open)
          if (!open) {
            // Refresh the profile when dialog closes (after apply or cancel)
            onImportComplete()
            // Show success message if publications were imported
            if (importedPublications > 0) {
              setSuccess(`Successfully imported ${importedPublications} publication${importedPublications !== 1 ? 's' : ''} from ORCID`)
            }
          }
        }}
        profileChanges={profileChanges}
        publicationCount={importedPublications}
        profileId={profileId}
        onApplyComplete={() => {
          setShowPreview(false)
          onImportComplete()
          if (importedPublications > 0) {
            setSuccess(`Successfully imported ${importedPublications} publication${importedPublications !== 1 ? 's' : ''} and applied profile changes from ORCID`)
          } else {
            setSuccess('Profile changes applied successfully')
          }
        }}
      />
    </div>
  )
}
