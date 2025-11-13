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
                    <span className="text-xs text-muted-foreground">
                      {(op.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  {op.target.node_id && (
                    <div className="text-xs text-muted-foreground">
                      Node ID: {op.target.node_id.substring(0, 8)}...
                    </div>
                  )}
                  {op.target.block_id && (
                    <div className="text-xs text-muted-foreground">
                      Block ID: {op.target.block_id.substring(0, 8)}...
                    </div>
                  )}
                  {op.reasoning && (
                    <div className="text-xs text-muted-foreground italic">
                      {op.reasoning}
                    </div>
                  )}
                  {Object.keys(op.changes).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Changes: {Object.keys(op.changes).join(', ')}
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

