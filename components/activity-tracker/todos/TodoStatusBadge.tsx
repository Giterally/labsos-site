'use client';

import { TodoStatus } from '@/types/activity-tracker';

interface TodoStatusBadgeProps {
  status: TodoStatus;
}

export default function TodoStatusBadge({ status }: TodoStatusBadgeProps) {
  const styles = {
    not_started: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    blocked: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
  };

  const labels = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    completed: 'Completed',
  };

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

