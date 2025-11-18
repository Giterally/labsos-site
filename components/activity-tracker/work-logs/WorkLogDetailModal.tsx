'use client';

import { WorkLogWithRelations } from '@/types/activity-tracker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, User, Folder, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

interface WorkLogDetailModalProps {
  workLog: WorkLogWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WorkLogDetailModal({ workLog, open, onOpenChange }: WorkLogDetailModalProps) {
  if (!workLog) return null;

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-2xl">{workLog.title}</DialogTitle>
            {workLog.is_meeting_note && (
              <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                Meeting Note
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Author */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Author</h3>
            <Link 
              href={`/researcher/${workLog.user_id}`}
              className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={workLog.user_profile.avatar_url || undefined} />
                <AvatarFallback>
                  {getInitials(workLog.user_profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{workLog.user_profile.full_name || 'Unknown'}</div>
                {workLog.user_profile.email && (
                  <div className="text-sm text-muted-foreground">{workLog.user_profile.email}</div>
                )}
              </div>
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Link>
          </div>

          {/* Content */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Content</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{workLog.content}</ReactMarkdown>
            </div>
          </div>

          {/* Project */}
          {workLog.project && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Project</h3>
              <Link
                href={`/project/${workLog.project.id}`}
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors p-2 rounded-md hover:bg-muted"
              >
                <Folder className="h-4 w-4" />
                <span>{workLog.project.name}</span>
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Link>
            </div>
          )}

          {/* Related Todo */}
          {workLog.todo && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Related Task</h3>
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 px-3 py-2 rounded-md">
                <CheckCircle className="h-4 w-4" />
                <span>{workLog.todo.title}</span>
              </div>
            </div>
          )}

          {/* Tree Node */}
          {workLog.tree_node && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Related to</h3>
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded-md">
                <FileText className="h-4 w-4" />
                <span>{workLog.tree_node.name}</span>
              </div>
            </div>
          )}

          {/* Tags */}
          {workLog.tags && workLog.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {workLog.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Date:</span>{' '}
                {format(new Date(workLog.log_date), 'EEEE, MMMM d, yyyy')}
              </div>
              <div>
                <span className="font-medium">Time:</span>{' '}
                {format(new Date(workLog.created_at), 'h:mm a')}
              </div>
              <div>
                <span className="font-medium">Created:</span>{' '}
                {format(new Date(workLog.created_at), 'MMMM d, yyyy')}
              </div>
              {workLog.edited_at && (
                <div>
                  <span className="font-medium">Last Edited:</span>{' '}
                  {format(new Date(workLog.edited_at), 'MMMM d, yyyy')}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

