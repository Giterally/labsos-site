'use client';

import { useState, useEffect } from 'react';
import { WorkLogFilters as WorkLogFiltersType } from '@/types/activity-tracker';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

interface WorkLogFiltersProps {
  filters: WorkLogFiltersType;
  onFiltersChange: (filters: WorkLogFiltersType) => void;
  showProjectFilter?: boolean; // Only show project filter when not on a project page
}

export default function WorkLogFilters({ filters, onFiltersChange, showProjectFilter = false }: WorkLogFiltersProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    if (showProjectFilter) {
      fetchProjects();
    }
  }, [showProjectFilter]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session available');
        return;
      }

      // Fetch all projects the user is a member of
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
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const updateFilter = (key: keyof WorkLogFiltersType, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-muted/50 p-4 rounded-lg space-y-4">
      <div className={`grid grid-cols-1 ${showProjectFilter ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search logs..."
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {showProjectFilter && (
          <div>
            <Label htmlFor="project-filter" className="text-xs text-muted-foreground mb-1 block">
              Project
            </Label>
            <Select
              value={filters.project_id || 'all'}
              onValueChange={(value) => updateFilter('project_id', value === 'all' ? undefined : value)}
            >
              <SelectTrigger id="project-filter">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {loadingProjects ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
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

        <div>
          <Label htmlFor="start-date" className="text-xs text-muted-foreground mb-1 block">
            From Date
          </Label>
          <Input
            id="start-date"
            type="date"
            value={filters.start_date || ''}
            onChange={(e) => updateFilter('start_date', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="end-date" className="text-xs text-muted-foreground mb-1 block">
            To Date
          </Label>
          <Input
            id="end-date"
            type="date"
            value={filters.end_date || ''}
            onChange={(e) => updateFilter('end_date', e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="meeting-notes-only"
              checked={filters.is_meeting_note === true}
              onCheckedChange={(checked) => 
                updateFilter('is_meeting_note', checked ? true : undefined)
              }
            />
            <Label htmlFor="meeting-notes-only" className="text-sm cursor-pointer">
              Meeting notes only
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

