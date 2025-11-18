'use client';

import { TodoPriority } from '@/types/activity-tracker';
import { AlertCircle } from 'lucide-react';

interface TodoPriorityBadgeProps {
  priority: TodoPriority;
}

export default function TodoPriorityBadge({ priority }: TodoPriorityBadgeProps) {
  const styles = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600',
  };

  return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${styles[priority]}`}>
      {priority === 'urgent' && <AlertCircle className="h-3 w-3" />}
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

