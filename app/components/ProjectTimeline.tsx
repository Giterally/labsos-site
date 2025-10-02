"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { 
  CheckCircleIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  ChevronRightIcon,
  CalendarIcon,
  UserIcon
} from "@heroicons/react/24/outline"

interface Milestone {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  dueDate: string
  completedDate?: string
  assignee: string
  deliverables?: Deliverable[]
}

interface Deliverable {
  id: string
  title: string
  type: 'code' | 'document' | 'dataset' | 'presentation' | 'publication' | 'other'
  status: 'draft' | 'in_review' | 'approved' | 'published'
}

interface ProjectTimelineProps {
  milestones: Milestone[]
  onMilestoneClick: (milestone: Milestone) => void
  onDeliverableClick: (deliverable: Deliverable) => void
}

export default function ProjectTimeline({ 
  milestones, 
  onMilestoneClick, 
  onDeliverableClick 
}: ProjectTimelineProps) {
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-3 w-3 text-green-600" />
      case 'in_progress':
        return <ClockIcon className="h-3 w-3 text-blue-600" />
      case 'cancelled':
        return <ExclamationTriangleIcon className="h-3 w-3 text-red-600" />
      default:
        return <ClockIcon className="h-3 w-3 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getDeliverableIcon = (type: string) => {
    switch (type) {
      case 'code':
        return '💻'
      case 'document':
        return '📄'
      case 'dataset':
        return '📊'
      case 'presentation':
        return '📽️'
      case 'publication':
        return '📚'
      default:
        return '📋'
    }
  }

  const getDeliverableStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'in_review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const toggleMilestone = (milestoneId: string) => {
    setExpandedMilestone(expandedMilestone === milestoneId ? null : milestoneId)
  }

  const handleMilestoneClick = (milestone: Milestone) => {
    onMilestoneClick(milestone)
  }

  const handleDeliverableClick = (deliverable: Deliverable) => {
    onDeliverableClick(deliverable)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Project Timeline</h3>
        <Badge variant="outline">{milestones.length} milestones</Badge>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        <div className="space-y-6">
          {milestones.map((milestone, index) => (
            <div key={milestone.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute left-6 top-6 w-4 h-4 bg-white border-2 border-gray-300 rounded-full -translate-x-1/2 z-10 flex items-center justify-center">
                {getStatusIcon(milestone.status)}
              </div>

              {/* Milestone content */}
              <div className="ml-12">
                <Card 
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    expandedMilestone === milestone.id ? 'ring-2 ring-primary/20' : ''
                  }`}
                  onClick={() => handleMilestoneClick(milestone)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <CardTitle className="text-base">{milestone.title}</CardTitle>
                          <Badge className={getStatusColor(milestone.status)}>
                            {milestone.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {milestone.description}
                        </p>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <CalendarIcon className="h-3 w-3" />
                            <span>Due: {formatDate(milestone.dueDate)}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <UserIcon className="h-3 w-3" />
                            <span>{milestone.assignee}</span>
                          </div>
                          {milestone.completedDate && (
                            <div className="flex items-center space-x-1">
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Completed: {formatDate(milestone.completedDate)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMilestone(milestone.id)
                        }}
                        className="ml-2"
                      >
                        <ChevronRightIcon 
                          className={`h-4 w-4 transition-transform ${
                            expandedMilestone === milestone.id ? 'rotate-90' : ''
                          }`}
                        />
                      </Button>
                    </div>
                  </CardHeader>

                  {/* Expanded deliverables */}
                  {expandedMilestone === milestone.id && milestone.deliverables && (
                    <CardContent className="pt-0 border-t">
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Deliverables ({milestone.deliverables.length})
                        </h4>
                        {milestone.deliverables.map((deliverable) => (
                          <div
                            key={deliverable.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeliverableClick(deliverable)
                            }}
                          >
                            <div className="flex items-center space-x-3">
                              <span className="text-lg">{getDeliverableIcon(deliverable.type)}</span>
                              <div>
                                <p className="text-sm font-medium">{deliverable.title}</p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {deliverable.type}
                                </p>
                              </div>
                            </div>
                            <Badge className={getDeliverableStatusColor(deliverable.status)}>
                              {deliverable.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            </div>
          ))}
        </div>
      </div>

      {milestones.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No milestones yet. Add your first milestone to get started!</p>
        </div>
      )}
    </div>
  )
} 