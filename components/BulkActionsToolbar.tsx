"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  TrashIcon, 
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDeleteSelected: () => void
}

export function BulkActionsToolbar({ 
  selectedCount, 
  totalCount, 
  onSelectAll, 
  onDeselectAll, 
  onDeleteSelected 
}: BulkActionsToolbarProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const allSelected = selectedCount === totalCount && totalCount > 0
  const someSelected = selectedCount > 0 && selectedCount < totalCount

  const handleSelectAll = () => {
    if (allSelected) {
      onDeselectAll()
    } else {
      onSelectAll()
    }
  }

  const handleDeleteSelected = async () => {
    setIsDeleting(true)
    try {
      await onDeleteSelected()
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Error deleting publications:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  if (totalCount === 0) {
    return null
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onCheckedChange={handleSelectAll}
            />
            <Label 
              htmlFor="select-all" 
              className="text-sm font-medium cursor-pointer hover:text-primary"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Label>
          </div>
          
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCount} of {totalCount} selected
            </Badge>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDeselectAll}
              className="text-xs h-8"
            >
              <XMarkIcon className="h-3 w-3 mr-1" />
              Clear
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="text-xs h-8"
            >
              <TrashIcon className="h-3 w-3 mr-1" />
              Delete ({selectedCount})
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Publications</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCount} publication{selectedCount > 1 ? 's' : ''}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon className="h-3 w-3 mr-2" />
                  Delete {selectedCount} Publication{selectedCount > 1 ? 's' : ''}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
