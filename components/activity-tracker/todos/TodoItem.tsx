'use client';

import { TodoWithRelations } from '@/types/activity-tracker';
import { Button } from '@/components/ui/button';
import TodoStatusBadge from './TodoStatusBadge';
import TodoPriorityBadge from './TodoPriorityBadge';
import { Edit, Trash2, MessageSquare, Calendar, User, Folder, Repeat } from 'lucide-react';
import { format } from 'date-fns';

interface TodoItemProps {
  todo: TodoWithRelations;
  onEdit: (todo: TodoWithRelations) => void;
  onDelete: (id: string) => void;
  onView?: (todo: TodoWithRelations) => void;
}

export default function TodoItem({ todo, onEdit, onDelete, onView }: TodoItemProps) {
  const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'completed';
  const isDueSoon = todo.due_date && 
    new Date(todo.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000 &&
    todo.status !== 'completed';

  return (
    <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg">
      <div 
        className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => onView?.(todo)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className={`font-medium ${todo.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {todo.title}
            </h3>
            {todo.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-5">{todo.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {todo.is_recurring_meeting && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium">
                <Repeat className="h-3 w-3" />
                <span>Recurring</span>
              </div>
            )}
            {todo.priority && <TodoPriorityBadge priority={todo.priority} />}
            <TodoStatusBadge status={todo.status} />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          {todo.due_date && (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-yellow-600 font-medium' : ''}`}>
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(todo.due_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {todo.project_assignments && todo.project_assignments.length > 0 && (
            <div className="flex items-center gap-1">
              <Folder className="h-4 w-4" />
              <span className="text-xs">
                {todo.project_assignments.length} project{todo.project_assignments.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
          {todo.assignees && todo.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{todo.assignees.length} assigned</span>
            </div>
          )}
          {todo.comments_count && todo.comments_count > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              <span>{todo.comments_count}</span>
            </div>
          )}
          {todo.tree_node && (
            <div className="flex items-center gap-1 text-blue-600">
              <span className="text-xs bg-blue-50 px-2 py-1 rounded">
                {todo.tree_node.name}
              </span>
            </div>
          )}
        </div>
        {todo.tags && todo.tags.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {todo.tags.map((tag) => (
              <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={(e) => {
            e.stopPropagation();
            onEdit(todo);
          }}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    </div>
  );
}

