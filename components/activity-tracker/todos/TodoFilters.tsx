'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { TodoFilters as TodoFiltersType } from '@/types/activity-tracker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

interface TodoFiltersProps {
  filters: TodoFiltersType;
  onFiltersChange: (filters: TodoFiltersType) => void;
  isPersonalTasks?: boolean; // Whether we're filtering personal tasks
}

export default function TodoFilters({ filters, onFiltersChange, isPersonalTasks = false }: TodoFiltersProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    if (isPersonalTasks) {
      fetchProjects();
    }
  }, [isPersonalTasks]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
      
      setProjects(userProjects.map((p: any) => ({
        id: p.id,
        name: p.name,
      })));
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const updateFilter = (key: keyof TodoFiltersType, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-muted/50 p-4 rounded-lg space-y-4">
      <div className={`grid grid-cols-1 ${isPersonalTasks ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>
        <div>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) => updateFilter('status', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select
            value={filters.priority || 'all'}
            onValueChange={(value) => updateFilter('priority', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-completed"
            checked={filters.show_completed}
            onCheckedChange={(checked) => updateFilter('show_completed', checked)}
          />
          <Label htmlFor="show-completed" className="text-sm cursor-pointer">
            Show completed
          </Label>
        </div>
        {isPersonalTasks && (
          <div>
            <Select
              value={filters.linked_project_id || 'all'}
              onValueChange={(value) => updateFilter('linked_project_id', value === 'all' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {loadingProjects ? (
                  <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                ) : projects.length === 0 ? (
                  <SelectItem value="no-projects" disabled>No projects available</SelectItem>
                ) : (
                  projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

