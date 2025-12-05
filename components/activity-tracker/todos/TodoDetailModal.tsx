'use client';

import { TodoWithRelations } from '@/types/activity-tracker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import TodoStatusBadge from './TodoStatusBadge';
import TodoPriorityBadge from './TodoPriorityBadge';
import TodoMeetingUpdates from './TodoMeetingUpdates';
import { Calendar, User, Folder, FileText, CheckCircle, ExternalLink, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

interface TodoDetailModalProps {
  todo: TodoWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TodoDetailModal({ todo, open, onOpenChange }: TodoDetailModalProps) {
  if (!todo) return null;

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'completed';
  const isDueSoon = todo.due_date && 
    new Date(todo.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000 &&
    todo.status !== 'completed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2 flex-wrap">
            {todo.title}
            {todo.is_recurring_meeting && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium">
                <Repeat className="h-3 w-3" />
                <span>Recurring Meeting</span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Priority */}
          <div className="flex items-center gap-3">
            <TodoStatusBadge status={todo.status} />
            {todo.priority && <TodoPriorityBadge priority={todo.priority} />}
          </div>

          {/* Description */}
          {todo.description && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{todo.description}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Due Date */}
          {todo.due_date && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Due Date</h3>
              <div className={`flex items-center gap-2 ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-yellow-600 font-medium' : 'text-foreground'}`}>
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(todo.due_date), 'EEEE, MMMM d, yyyy')}</span>
                {isOverdue && <span className="text-xs text-red-600">(Overdue)</span>}
                {isDueSoon && !isOverdue && <span className="text-xs text-yellow-600">(Due soon)</span>}
              </div>
            </div>
          )}

          {/* Created By */}
          {todo.created_by_profile && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Created By</h3>
              <Link 
                href={`/researcher/${todo.created_by}`}
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={todo.created_by_profile.avatar_url || undefined} />
                  <AvatarFallback>
                    {getInitials(todo.created_by_profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span>{todo.created_by_profile.full_name || 'Unknown'}</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Completed By */}
          {todo.completed_by_profile && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Completed By</h3>
              <Link 
                href={`/researcher/${todo.completed_by}`}
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={todo.completed_by_profile.avatar_url || undefined} />
                  <AvatarFallback>
                    {getInitials(todo.completed_by_profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span>{todo.completed_by_profile.full_name || 'Unknown'}</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
              {todo.completed_at && (
                <p className="text-sm text-muted-foreground ml-10 mt-1">
                  {format(new Date(todo.completed_at), 'MMMM d, yyyy')}
                </p>
              )}
            </div>
          )}

          {/* Project Assignments */}
          {todo.project_assignments && todo.project_assignments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Assigned to Projects</h3>
              <div className="space-y-2">
                {todo.project_assignments.map((pa) => (
                  <Link
                    key={pa.project_id}
                    href={`/project/${pa.project_id}`}
                    className="flex items-center gap-2 text-foreground hover:text-primary transition-colors p-2 rounded-md hover:bg-muted"
                  >
                    <Folder className="h-4 w-4" />
                    <span>{pa.project?.name || 'Unknown Project'}</span>
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Project Links (for personal tasks) */}
          {todo.project_links && todo.project_links.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Linked to Projects</h3>
              <p className="text-xs text-muted-foreground mb-2">
                These projects are linked for organization only. The task is not shared with project members.
              </p>
              <div className="space-y-2">
                {todo.project_links.map((pl) => (
                  <Link
                    key={pl.project_id}
                    href={`/project/${pl.project_id}`}
                    className="flex items-center gap-2 text-foreground hover:text-primary transition-colors p-2 rounded-md hover:bg-muted"
                  >
                    <Folder className="h-4 w-4" />
                    <span>{pl.project?.name || 'Unknown Project'}</span>
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Individual Assignees */}
          {todo.assignees && todo.assignees.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Assigned to</h3>
              <div className="space-y-2">
                {todo.assignees.map((assignee) => (
                  <Link
                    key={assignee.user_id}
                    href={`/researcher/${assignee.user_id}`}
                    className="flex items-center gap-2 text-foreground hover:text-primary transition-colors p-2 rounded-md hover:bg-muted"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={assignee.user_profile?.avatar_url || undefined} />
                      <AvatarFallback>
                        {getInitials(assignee.user_profile?.full_name || null)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{assignee.user_profile?.full_name || 'Unknown'}</span>
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tree Node */}
          {todo.tree_node && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Related to</h3>
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <FileText className="h-4 w-4" />
                <span>{todo.tree_node.name}</span>
              </div>
            </div>
          )}

          {/* Tags */}
          {todo.tags && todo.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {todo.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meeting Updates (for recurring meetings) */}
          {todo.is_recurring_meeting && (
            <div className="pt-4 border-t border-border">
              <TodoMeetingUpdates 
                todoId={todo.id} 
                isRecurringMeeting={todo.is_recurring_meeting} 
              />
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Created:</span>{' '}
                {format(new Date(todo.created_at), 'MMMM d, yyyy')}
              </div>
              <div>
                <span className="font-medium">Last Updated:</span>{' '}
                {format(new Date(todo.updated_at), 'MMMM d, yyyy')}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

