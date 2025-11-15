"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, X, AlertCircle, Loader2 } from "lucide-react"
import type { GeneratedActionPlan } from "@/lib/ai-action-handler"

interface ActionPlanPreviewProps {
  plan: GeneratedActionPlan
  onConfirm: () => void
  onCancel: () => void
  isExecuting?: boolean
}

export default function ActionPlanPreview({
  plan,
  onConfirm,
  onCancel,
  isExecuting = false
}: ActionPlanPreviewProps) {
  const getOperationIcon = (type: string) => {
    if (type.includes('create') || type.includes('add')) return '➕'
    if (type.includes('update') || type.includes('edit')) return '✏️'
    if (type.includes('delete') || type.includes('remove')) return '🗑️'
    if (type.includes('move')) return '↔️'
    return '⚙️'
  }

  const getOperationColor = (type: string) => {
    if (type.includes('delete') || type.includes('remove')) return 'destructive'
    if (type.includes('create') || type.includes('add')) return 'default'
    return 'secondary'
  }

  const formatOperationType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          Action Plan Preview
        </CardTitle>
        <CardDescription>
          {plan.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {plan.estimated_impact}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Operations ({plan.operations.length}):</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {plan.operations.map((op, idx) => (
              <div
                key={op.operation_id || idx}
                className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50"
              >
                <div className="text-2xl mt-0.5">{getOperationIcon(op.type)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={getOperationColor(op.type) as any}>
                      {formatOperationType(op.type)}
                    </Badge>
                  </div>
                  
                  {/* Target Name Display */}
                  {(op.target.node_name || op.target.block_name) && (
                    <div className="text-sm font-medium text-foreground">
                      {op.target.node_name && (
                        <span>
                          Node: <span className="font-semibold">{op.target.node_name}</span>
                          {op.target.block_name && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (in {op.target.block_name})
                            </span>
                          )}
                        </span>
                      )}
                      {!op.target.node_name && op.target.block_name && (
                        <span>
                          Block: <span className="font-semibold">{op.target.block_name}</span>
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Move operation shows source and destination */}
                  {op.type === 'move_node' && op.target.target_block_name && (
                    <div className="text-xs text-muted-foreground">
                      Moving to: <span className="font-medium text-foreground">{op.target.target_block_name}</span>
                      {op.changes.new_position && (
                        <span> (position {op.changes.new_position})</span>
                      )}
                    </div>
                  )}
                  
                  {/* Before/After Comparison */}
                  {op.before && Object.keys(op.changes).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Object.keys(op.changes).map((key) => {
                        const beforeValue = op.before?.[key]
                        const afterValue = op.changes[key]
                        
                        // Skip if values are the same or if before value doesn't exist
                        if (beforeValue === undefined || beforeValue === afterValue) {
                          return null
                        }
                        
                        return (
                          <div key={key} className="text-xs border rounded p-2 bg-background">
                            <div className="font-medium mb-1 capitalize">{key.replace(/_/g, ' ')}:</div>
                            <div className="space-y-1">
                              <div className="flex items-start gap-2">
                                <span className="text-destructive font-medium min-w-[3rem]">Before:</span>
                                <span className="text-muted-foreground line-through break-words">
                                  {typeof beforeValue === 'string' && beforeValue.length > 100 
                                    ? `${beforeValue.substring(0, 100)}...` 
                                    : beforeValue || '(empty)'}
                                </span>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-green-600 dark:text-green-400 font-medium min-w-[3rem]">After:</span>
                                <span className="text-foreground font-medium break-words">
                                  {typeof afterValue === 'string' && afterValue.length > 100 
                                    ? `${afterValue.substring(0, 100)}...` 
                                    : afterValue || '(empty)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  
                  {/* Fallback: Show changes list if no before state */}
                  {!op.before && Object.keys(op.changes).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <div className="font-medium mb-1">Changes:</div>
                      <div className="space-y-0.5">
                        {Object.entries(op.changes).map(([key, value]) => (
                          <div key={key} className="capitalize">
                            <span className="font-medium">{key.replace(/_/g, ' ')}:</span>{' '}
                            <span className="text-foreground">
                              {typeof value === 'string' && value.length > 50 
                                ? `${value.substring(0, 50)}...` 
                                : String(value) || '(empty)'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={onConfirm}
            disabled={isExecuting}
            className="flex-1"
          >
            {isExecuting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Confirm & Execute
              </>
            )}
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            disabled={isExecuting}
            className="flex-1"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

