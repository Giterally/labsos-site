"use client"

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  PencilIcon, 
  TrashIcon, 
  ChevronDownIcon, 
  ChevronUpIcon,
  LinkIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { Linkedin } from 'lucide-react'
import { Publication } from '@/lib/types'
import Image from 'next/image'

interface PublicationListItemProps {
  publication: Publication
  isSelected: boolean
  showCheckbox: boolean
  onSelect: (id: string) => void
  onEdit: (publication: Publication) => void
  onDelete: (id: string) => void
}

export function PublicationListItem({ 
  publication, 
  isSelected, 
  showCheckbox, 
  onSelect, 
  onEdit, 
  onDelete 
}: PublicationListItemProps) {
  const [showAbstract, setShowAbstract] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this publication?')) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete(publication.id)
    } catch (error) {
      console.error('Error deleting publication:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatAuthors = (authors: string[]) => {
    if (authors.length <= 3) return authors.join(', ')
    return `${authors.slice(0, 3).join(', ')} et al.`
  }

  const isLinkedInUrl = (url: string) => {
    return url.includes('linkedin.com')
  }

  const formatDate = () => {
    const parts = []
    if (publication.year) parts.push(publication.year)
    if (publication.month) parts.push(publication.month.toString().padStart(2, '0'))
    if (publication.day) parts.push(publication.day.toString().padStart(2, '0'))
    return parts.join('-')
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'journal-article': 'bg-blue-100 text-blue-800 dark:bg-blue-800/50 dark:text-blue-200',
      'conference-paper': 'bg-green-100 text-green-800 dark:bg-green-800/50 dark:text-green-200',
      'book-chapter': 'bg-purple-100 text-purple-800 dark:bg-purple-800/50 dark:text-purple-200',
      'preprint': 'bg-orange-100 text-orange-800 dark:bg-orange-800/50 dark:text-orange-200',
      'thesis': 'bg-pink-100 text-pink-800 dark:bg-pink-800/50 dark:text-pink-200',
      'book': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800/50 dark:text-indigo-200',
      'other': 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-200'
    }
    return colors[type] || colors.other
  }

  return (
    <Card className={`hover:shadow-md transition-all duration-200 relative ${isSelected ? 'ring-2 ring-primary !bg-muted' : ''}`}>
      <CardContent className="p-4">
        {/* ORCID Logo - Top Right */}
        {publication.source === 'orcid' && (
          <div className="absolute top-3 right-3">
            <Image
              src="/orcid-logo.svg"
              alt="ORCID"
              width={16}
              height={16}
              className="flex-shrink-0"
              title="Imported from ORCID"
            />
          </div>
        )}
        
        <div className="flex items-start space-x-3">
          {showCheckbox && (
            <Checkbox
              id={`publication-${publication.id}`}
              checked={isSelected}
              onCheckedChange={() => onSelect(publication.id)}
              className="mt-1 border-2 border-gray-400 hover:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            />
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelect(publication.id)}
              >
                <div className="mb-2">
                  <h3 className="font-semibold text-foreground line-clamp-2">
                    {publication.title}
                  </h3>
                </div>
                
                <div className="text-sm text-muted-foreground space-y-1">
                  {publication.authors && publication.authors.length > 0 && (
                    <p className="font-medium">{formatAuthors(publication.authors)}</p>
                  )}
                  
                  <div className="flex items-center space-x-2 flex-wrap">
                    {publication.journal_title && (
                      <span className="italic">{publication.journal_title}</span>
                    )}
                    {formatDate() && (
                      <span>• {formatDate()}</span>
                    )}
                    {publication.type && publication.type !== 'other' && publication.type !== 'None' && publication.type !== null && (
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${getTypeColor(publication.type)}`}
                      >
                        {publication.type.replace('-', ' ')}
                      </Badge>
                    )}
                  </div>

                  {publication.doi && (
                    <div className="flex items-center space-x-1">
                      <span className="text-xs">DOI:</span>
                      <a
                        href={`https://doi.org/${publication.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs hover:underline ${isSelected ? 'text-blue-400 dark:text-blue-300' : 'text-blue-600 dark:text-blue-400'}`}
                      >
                        {publication.doi}
                      </a>
                    </div>
                  )}

                  {publication.url && (
                    <div className="flex items-center space-x-1">
                      {isLinkedInUrl(publication.url) ? (
                        <Linkedin className={`h-3 w-3 ${isSelected ? 'text-blue-400 dark:text-blue-300' : 'text-blue-600 dark:text-blue-400'}`} />
                      ) : (
                        <LinkIcon className="h-3 w-3" />
                      )}
                      <a
                        href={publication.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs hover:underline ${isSelected ? 'text-blue-400 dark:text-blue-300' : 'text-blue-600 dark:text-blue-400'}`}
                      >
                        {isLinkedInUrl(publication.url) ? 'View on LinkedIn' : 'View Paper'}
                      </a>
                    </div>
                  )}
                </div>

                {publication.abstract && (
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowAbstract(!showAbstract)
                      }}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showAbstract ? (
                        <>
                          <ChevronUpIcon className="h-3 w-3 mr-1" />
                          Hide Abstract
                        </>
                      ) : (
                        <>
                          <ChevronDownIcon className="h-3 w-3 mr-1" />
                          Show Abstract
                        </>
                      )}
                    </Button>
                    
                    {showAbstract && (
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        {publication.abstract}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-1 ml-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(publication)}
                  className="h-8 w-8 p-0"
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
