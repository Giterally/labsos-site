'use client';

import { WorkLogWithRelations } from '@/types/activity-tracker';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Edit, Trash2, Calendar, User, CheckCircle, FileText, Folder } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { useUser } from '@/lib/user-context';

interface WorkLogEntryProps {
  workLog: WorkLogWithRelations;
  onEdit: (log: WorkLogWithRelations) => void;
  onDelete: (id: string) => void;
  onView?: (log: WorkLogWithRelations) => void;
}

export default function WorkLogEntry({ workLog, onEdit, onDelete, onView }: WorkLogEntryProps) {
  const { user } = useUser();
  const isCreator = user && workLog.user_id === user.id;
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
    <div 
      className="bg-card border border-border rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onView?.(workLog)}
    >
      <div className="flex items-start gap-4">
        <Avatar>
          <AvatarImage src={workLog.user_profile.avatar_url || undefined} />
          <AvatarFallback>
            {getInitials(workLog.user_profile.full_name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg text-foreground">{workLog.title}</h3>
                {workLog.is_meeting_note && (
                  <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                    Meeting Note
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {workLog.user_profile.full_name || 'Unknown'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(workLog.created_at), 'h:mm a')}
                </span>
                {workLog.edited_at && (
                  <span className="text-xs text-muted-foreground">(edited)</span>
                )}
              </div>
            </div>

            {isCreator && (
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(workLog);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(workLog.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 prose prose-sm dark:prose-invert max-w-none line-clamp-5">
            <ReactMarkdown>{workLog.content}</ReactMarkdown>
          </div>

          <div className="flex items-center gap-3 mt-4 text-sm">
            {workLog.project && (
              <div className="flex items-center gap-1 text-foreground bg-muted px-2 py-1 rounded">
                <Folder className="h-4 w-4" />
                <span>{workLog.project.name}</span>
              </div>
            )}

            {workLog.todo && (
              <div className="flex items-center gap-1 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-1 rounded">
                <CheckCircle className="h-4 w-4" />
                <span>Related to: {workLog.todo.title}</span>
              </div>
            )}

            {workLog.tree_node && (
              <div className="flex items-center gap-1 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded">
                <FileText className="h-4 w-4" />
                <span>{workLog.tree_node.name}</span>
              </div>
            )}
          </div>

          {workLog.tags && workLog.tags.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {workLog.tags.map((tag) => (
                <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

