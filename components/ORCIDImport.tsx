'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase-client'

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

      setSuccess(`Successfully imported ${data.importedPublications} publications from ORCID`)
      onImportComplete()
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
        <Label htmlFor="orcid">ORCID ID</Label>
        <div className="flex gap-2">
          <Input
            id="orcid"
            value={orcidId}
            onChange={(e) => setOrcidId(e.target.value)}
            placeholder="0000-0002-1825-0097"
            className="flex-1"
            disabled={loading}
          />
          <Button 
            onClick={handleImport} 
            disabled={loading || !isValidORCID}
            className="min-w-[120px]"
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
        </div>
        <p className="text-sm text-muted-foreground">
          Enter your ORCID ID to automatically import your publications and profile data
        </p>
        {orcidId.trim() && !isValidORCID && (
          <p className="text-sm text-destructive">
            Please enter a valid ORCID ID format (e.g., 0000-0002-1825-0097)
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
    </div>
  )
}
