"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Publication } from '@/lib/types'
import { supabase } from '@/lib/supabase-client'

interface PublicationFormProps {
  publication?: Publication
  profileId: string
  onSave: (publication: Publication) => void
  onCancel: () => void
}

const publicationTypes = [
  'journal-article',
  'book-chapter',
  'conference-paper',
  'preprint',
  'thesis',
  'book',
  'other'
]

export function PublicationForm({ publication, profileId, onSave, onCancel }: PublicationFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    authors: '',
    journal_title: '',
    year: new Date().getFullYear(),
    month: '',
    day: '',
    doi: '',
    url: '',
    type: 'journal-article',
    abstract: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (publication) {
      setFormData({
        title: publication.title || '',
        authors: (publication.authors || []).join(', '),
        journal_title: publication.journal_title || '',
        year: publication.year || new Date().getFullYear(),
        month: publication.month?.toString() || '',
        day: publication.day?.toString() || '',
        doi: publication.doi || '',
        url: publication.url || '',
        type: publication.type || 'journal-article',
        abstract: publication.abstract || ''
      })
    }
  }, [publication])

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const authors = formData.authors
        .split(',')
        .map(author => author.trim())
        .filter(author => author.length > 0)

      const publicationData = {
        ...formData,
        authors,
        year: parseInt(formData.year.toString()),
        month: formData.month ? parseInt(formData.month) : null,
        day: formData.day ? parseInt(formData.day) : null
      }

      if (publication) {
        // Update existing publication
        const response = await fetch(`/api/publications/${publication.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(publicationData),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update publication')
        }

        const result = await response.json()
        onSave(result.publication)
      } else {
        // Create new publication
        const response = await fetch('/api/publications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            profileId,
            ...publicationData
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create publication')
        }

        const result = await response.json()
        onSave(result.publication)
      }
    } catch (error: any) {
      console.error('Error saving publication:', error)
      alert(error.message || 'Failed to save publication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>
          {publication ? 'Edit Publication' : 'Add New Publication'}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <XMarkIcon className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Publication title"
                required
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="authors">Authors</Label>
              <Input
                id="authors"
                value={formData.authors}
                onChange={(e) => handleInputChange('authors', e.target.value)}
                placeholder="Comma-separated list of authors"
              />
            </div>

            <div>
              <Label htmlFor="journal_title">Journal/Conference</Label>
              <Input
                id="journal_title"
                value={formData.journal_title}
                onChange={(e) => handleInputChange('journal_title', e.target.value)}
                placeholder="Journal or conference name"
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {publicationTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) => handleInputChange('year', parseInt(e.target.value))}
                min="1800"
                max={new Date().getFullYear() + 1}
                required
              />
            </div>

            <div>
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                value={formData.month}
                onChange={(e) => handleInputChange('month', e.target.value)}
                min="1"
                max="12"
                placeholder="1-12"
              />
            </div>

            <div>
              <Label htmlFor="day">Day</Label>
              <Input
                id="day"
                type="number"
                value={formData.day}
                onChange={(e) => handleInputChange('day', e.target.value)}
                min="1"
                max="31"
                placeholder="1-31"
              />
            </div>

            <div>
              <Label htmlFor="doi">DOI</Label>
              <Input
                id="doi"
                value={formData.doi}
                onChange={(e) => handleInputChange('doi', e.target.value)}
                placeholder="10.1000/182"
              />
            </div>

            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => handleInputChange('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="abstract">Abstract</Label>
              <Textarea
                id="abstract"
                value={formData.abstract}
                onChange={(e) => handleInputChange('abstract', e.target.value)}
                placeholder="Publication abstract"
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (publication ? 'Update' : 'Create')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
