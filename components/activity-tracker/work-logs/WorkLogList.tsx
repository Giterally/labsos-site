'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useUser } from '@/lib/user-context';
import { WorkLogWithRelations, WorkLogFilters } from '@/types/activity-tracker';
import WorkLogEntry from './WorkLogEntry';
import WorkLogForm from './WorkLogForm';
import WorkLogFiltersComponent from './WorkLogFilters';
import WorkLogDetailModal from './WorkLogDetailModal';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface WorkLogListProps {
  projectId?: string;
  treeNodeId?: string;
}

// Validate projectId is a valid UUID before using it
const isValidUUID = (str: string | undefined): boolean => {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export default function WorkLogList({ projectId, treeNodeId }: WorkLogListProps) {
  const { user } = useUser();
  const [workLogs, setWorkLogs] = useState<WorkLogWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLog, setEditingLog] = useState<WorkLogWithRelations | null>(null);
  const [viewingLog, setViewingLog] = useState<WorkLogWithRelations | null>(null);
  
  const [filters, setFilters] = useState<WorkLogFilters>({
    project_id: projectId && isValidUUID(projectId) ? projectId : undefined,
    tree_node_id: treeNodeId && isValidUUID(treeNodeId) ? treeNodeId : undefined,
    // When no projectId is provided (e.g., in dashboard/tasks page), filter by current user
    user_id: (!projectId || !isValidUUID(projectId)) && user ? user.id : undefined,
  });

  // Update filters when projectId, treeNodeId, or user changes
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      project_id: projectId && isValidUUID(projectId) ? projectId : undefined,
      tree_node_id: treeNodeId && isValidUUID(treeNodeId) ? treeNodeId : undefined,
      // When no projectId is provided (e.g., in dashboard/tasks page), filter by current user
      user_id: (!projectId || !isValidUUID(projectId)) && user ? user.id : undefined,
    }));
  }, [projectId, treeNodeId, user]);

  useEffect(() => {
    if (user) {
      fetchWorkLogs();
    }
  }, [filters, user]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('work-logs-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_logs' },
        () => {
          fetchWorkLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, user]);

  const fetchWorkLogs = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams();
      if (filters.project_id) params.set('projectId', filters.project_id);
      if (filters.user_id) params.set('userId', filters.user_id);
      if (filters.start_date) params.set('startDate', filters.start_date);
      if (filters.end_date) params.set('endDate', filters.end_date);
      if (filters.tree_node_id) params.set('treeNodeId', filters.tree_node_id);
      if (filters.is_meeting_note !== undefined) params.set('isMeetingNote', String(filters.is_meeting_note));
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`/api/work-logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (response.ok) {
        setWorkLogs(data.workLogs || []);
      } else {
        console.error('Error fetching work logs:', data.error);
      }
    } catch (error) {
      console.error('Error fetching work logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLog = () => {
    setEditingLog(null);
    setShowForm(true);
  };

  const handleEditLog = (log: WorkLogWithRelations) => {
    setEditingLog(log);
    setShowForm(true);
  };

  const handleViewLog = (log: WorkLogWithRelations) => {
    setViewingLog(log);
  };

  const handleFormClose = (shouldRefresh: boolean = false) => {
    setShowForm(false);
    setEditingLog(null);
    if (shouldRefresh) {
      fetchWorkLogs();
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Are you sure you want to delete this work log?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/work-logs/${logId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        fetchWorkLogs();
      } else {
        const data = await response.json();
        console.error('Error deleting work log:', data.error);
      }
    } catch (error) {
      console.error('Error deleting work log:', error);
    }
  };

  const handleExportMarkdown = () => {
    // Group logs by date
    const groupedLogs = workLogs.reduce((acc, log) => {
      const date = log.log_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(log);
      return acc;
    }, {} as Record<string, WorkLogWithRelations[]>);

    // Generate markdown
    let markdown = '# Work Log Export\n\n';
    markdown += `Generated: ${format(new Date(), 'MMMM d, yyyy')}\n\n`;

    Object.entries(groupedLogs)
      .sort(([a], [b]) => b.localeCompare(a))
      .forEach(([date, logs]) => {
        markdown += `## ${format(parseISO(date), 'MMMM d, yyyy')}\n\n`;
        
        logs.forEach(log => {
          markdown += `### ${log.title}\n`;
          markdown += `**Author:** ${log.user_profile.full_name || 'Unknown'}\n`;
          if (log.is_meeting_note) {
            markdown += `**Type:** Meeting Note\n`;
          }
          if (log.tags && log.tags.length > 0) {
            markdown += `**Tags:** ${log.tags.join(', ')}\n`;
          }
          markdown += `\n${log.content}\n\n`;
          markdown += '---\n\n';
        });
      });

    // Create download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-logs-${format(new Date(), 'yyyy-MM-dd')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Group work logs by date for timeline view
  const groupedLogs = workLogs.reduce((acc, log) => {
    const date = log.log_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, WorkLogWithRelations[]>);

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  if (!user) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Please log in to view work logs
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Work Logs</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportMarkdown} disabled={workLogs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Markdown
          </Button>
          <Button onClick={handleCreateLog}>
            <Plus className="h-4 w-4 mr-2" />
            Log Work
          </Button>
        </div>
      </div>

      <WorkLogFiltersComponent 
        filters={filters} 
        onFiltersChange={setFilters}
        showProjectFilter={!projectId || !isValidUUID(projectId)}
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : workLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No work logs found. Create your first log entry to track your progress!
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <div className="sticky top-0 bg-muted/50 border-b border-border py-2 px-4 mb-4 rounded-lg">
                <h3 className="font-semibold text-lg text-foreground">
                  {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                </h3>
              </div>
              <div className="space-y-4">
                {groupedLogs[date].map((log) => (
                  <WorkLogEntry
                    key={log.id}
                    workLog={log}
                    onEdit={handleEditLog}
                    onDelete={handleDelete}
                    onView={handleViewLog}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <WorkLogForm
          workLog={editingLog}
          projectId={projectId}
          treeNodeId={treeNodeId}
          onClose={handleFormClose}
        />
      )}

      <WorkLogDetailModal
        workLog={viewingLog}
        open={!!viewingLog}
        onOpenChange={(open) => {
          if (!open) setViewingLog(null);
        }}
      />
    </div>
  );
}

