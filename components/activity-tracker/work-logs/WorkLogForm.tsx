'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { WorkLogWithRelations, CreateWorkLogRequest } from '@/types/activity-tracker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Validate if a string is a valid UUID
const isValidUUID = (str: string | undefined): boolean => {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

interface WorkLogFormProps {
  workLog?: WorkLogWithRelations | null;
  projectId?: string;
  treeNodeId?: string;
  onClose: (shouldRefresh?: boolean) => void;
}

export default function WorkLogForm({ workLog, projectId, treeNodeId, onClose }: WorkLogFormProps) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  
  // Only use projectId if it's a valid UUID
  const validProjectId = projectId && isValidUUID(projectId) ? projectId : undefined;
  
  const [formData, setFormData] = useState({
    project_id: workLog?.project_id || validProjectId || '',
    title: workLog?.title || '',
    content: workLog?.content || '',
    log_date: workLog?.log_date || new Date().toISOString().split('T')[0],
    tree_node_id: workLog?.tree_node_id || treeNodeId || '',
    todo_id: workLog?.todo_id || '',
    is_meeting_note: workLog?.is_meeting_note || false,
    tags: workLog?.tags?.join(', ') || '',
  });

  useEffect(() => {
    if (!validProjectId) {
      fetchProjects();
    }
  }, [validProjectId]);

  const fetchProjects = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session available');
        return;
      }

      // Use the API endpoint which filters to only projects the user is a member of
      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      const userProjects = data.projects || [];
      
      // Extract just id and name for the dropdown
      const projectOptions = userProjects.map((p: any) => ({
        id: p.id,
        name: p.name,
      }));

      setProjects(projectOptions);

      // Auto-select first project if creating new log and no valid projectId provided
      if (!workLog && !validProjectId && projectOptions.length > 0) {
        setFormData(prev => ({ ...prev, project_id: projectOptions[0].id }));
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to create work logs');
        return;
      }

      // Validate project_id is a valid UUID before submitting
      if (!formData.project_id || !isValidUUID(formData.project_id)) {
        alert('Please select a valid project');
        return;
      }

      const payload: any = {
        ...formData,
        project_id: formData.project_id, // Already validated above
        tree_node_id: formData.tree_node_id && isValidUUID(formData.tree_node_id) ? formData.tree_node_id : null,
        todo_id: formData.todo_id && isValidUUID(formData.todo_id) ? formData.todo_id : null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      let response;
      if (workLog) {
        // Update existing work log
        response = await fetch(`/api/work-logs/${workLog.id}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new work log
        response = await fetch('/api/work-logs', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        onClose(true); // Refresh the list after successful save
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving work log:', error);
      alert('Error saving work log');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workLog ? 'Edit Work Log' : 'Log Work'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={validProjectId ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
            {!validProjectId && (
              <div>
                <Label htmlFor="project_id">Project *</Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(value) => setFormData({ ...formData, project_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="log_date">Date *</Label>
              <Input
                id="log_date"
                type="date"
                value={formData.log_date}
                onChange={(e) => setFormData({ ...formData, log_date: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief summary of what was accomplished"
              required
            />
          </div>

          <div>
            <Label htmlFor="content">Content * (Markdown supported)</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Detailed description of work done, findings, decisions made..."
              rows={10}
              required
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Supports Markdown formatting: **bold**, *italic*, `code`, - lists, etc.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_meeting_note"
              checked={formData.is_meeting_note}
              onCheckedChange={(checked) => setFormData({ ...formData, is_meeting_note: !!checked })}
            />
            <Label htmlFor="is_meeting_note" className="cursor-pointer">
              This is a meeting note
            </Label>
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="weekly-meeting, experiment-results, data-analysis"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : workLog ? 'Update Log' : 'Create Log'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

