'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { TodoWithRelations, TodoStatus, TodoPriority, CreateTodoRequest } from '@/types/activity-tracker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TodoFormProps {
  todo?: TodoWithRelations | null;
  projectId?: string;
  treeNodeId?: string;
  activeTab?: 'my-tasks' | 'project'; // Which tab is active when creating
  onClose: (shouldRefresh?: boolean) => void;
}

interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function TodoForm({ todo, projectId, treeNodeId, activeTab, onClose }: TodoFormProps) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    todo?.project_assignments?.map(pa => pa.project_id) || []
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    todo?.assignees?.map(a => a.user_id) || []
  );
  
  const [formData, setFormData] = useState({
    title: todo?.title || '',
    description: todo?.description || '',
    status: (todo?.status || 'not_started') as TodoStatus,
    priority: todo?.priority || null,
    due_date: todo?.due_date ? new Date(todo.due_date).toISOString().split('T')[0] : '',
    tree_node_id: todo?.tree_node_id || treeNodeId || '',
    tags: todo?.tags?.join(', ') || '',
    is_recurring_meeting: todo?.is_recurring_meeting || false,
  });

  // Fetch projects and users
  useEffect(() => {
    fetchProjects();
    fetchUsers();
  }, []);

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

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get all users from projects the user is a member of
      const projectsResponse = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!projectsResponse.ok) return;

      const projectsData = await projectsResponse.json();
      const userProjects = projectsData.projects || [];
      
      // Collect all unique users from all projects
      const userIds = new Set<string>();
      for (const project of userProjects) {
        const teamResponse = await fetch(`/api/projects/${project.id}/team`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          (teamData.members || []).forEach((member: any) => {
            if (member.user_id) userIds.add(member.user_id);
          });
        }
      }

      // Fetch profile data for all users
      if (userIds.size > 0) {
        const { data: { session: session2 } } = await supabase.auth.getSession();
        if (!session2) return;

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', Array.from(userIds));

        setAllUsers((profiles || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
        })));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Get or create a default list for new todos
  const getOrCreateDefaultList = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const params = new URLSearchParams();
      if (projectId) {
        params.set('listType', 'shared');
        params.set('projectId', projectId);
      } else {
        params.set('listType', 'personal');
      }

      // First, try to get existing lists
      const response = await fetch(`/api/todos/lists?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (response.ok && data.lists && data.lists.length > 0) {
        // Use the first available list
        return data.lists[0].id;
      }

      // If no lists exist, create a default one
      const createResponse = await fetch('/api/todos/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: projectId ? 'Shared Tasks' : 'Personal Tasks',
          list_type: projectId ? 'shared' : 'personal',
          project_id: projectId || undefined,
        }),
      });

      const createData = await createResponse.json();
      if (createResponse.ok && createData.list) {
        return createData.list.id;
      }

      return null;
    } catch (error) {
      console.error('Error getting or creating default list:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to create tasks');
        return;
      }

      // For new todos, get or create a default list
      // Determine if this should be a shared or personal task
      let listId = todo?.list_id;
      if (!todo && !listId) {
        // Priority order for determining if shared:
        // 1. Project assignments selected in form
        // 2. projectId prop provided
        // 3. activeTab === 'project' (creating from Shared Tasks tab)
        const targetProjectId = selectedProjectIds.length > 0 ? selectedProjectIds[0] : projectId;
        const isSharedTab = activeTab === 'project';
        
        if (targetProjectId) {
          // SHARED TASK: Use a shared list for the selected project
          const params = new URLSearchParams();
          params.set('listType', 'shared');
          params.set('projectId', targetProjectId);

          const response = await fetch(`/api/todos/lists?${params.toString()}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          const data = await response.json();

          if (response.ok && data.lists && data.lists.length > 0) {
            listId = data.lists[0].id;
          } else {
            // Create a shared list for the project
            const createResponse = await fetch('/api/todos/lists', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                title: 'Shared Tasks',
                list_type: 'shared',
                project_id: targetProjectId,
              }),
            });
            const createData = await createResponse.json();
            if (createResponse.ok && createData.list) {
              listId = createData.list.id;
            }
          }
        } else if (isSharedTab && projects.length > 0) {
          // Creating from Shared Tasks tab but no project selected yet
          // Use the first available project's shared list (user can change later)
          const firstProject = projects[0];
          const params = new URLSearchParams();
          params.set('listType', 'shared');
          params.set('projectId', firstProject.id);

          const response = await fetch(`/api/todos/lists?${params.toString()}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          const data = await response.json();

          if (response.ok && data.lists && data.lists.length > 0) {
            listId = data.lists[0].id;
          } else {
            // Create a shared list for the first project
            const createResponse = await fetch('/api/todos/lists', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                title: 'Shared Tasks',
                list_type: 'shared',
                project_id: firstProject.id,
              }),
            });
            const createData = await createResponse.json();
            if (createResponse.ok && createData.list) {
              listId = createData.list.id;
            }
          }
        }
        
        // If no list yet, create/use a personal list
        if (!listId) {
          listId = await getOrCreateDefaultList();
        }
        
        if (!listId) {
          alert('Error: Could not create or find a task list. Please try again.');
          setLoading(false);
          return;
        }
      }

      const payload: any = {
        ...formData,
        list_id: listId,
        priority: formData.priority || null,
        due_date: formData.due_date || null,
        tree_node_id: formData.tree_node_id || null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        project_ids: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        assignee_ids: selectedUserIds.length > 0 ? selectedUserIds : undefined,
        is_recurring_meeting: isSharedTask ? formData.is_recurring_meeting : false,
      };

      let response;
      if (todo) {
        // Update existing todo - include assignments
        const updatePayload = {
          ...payload,
          project_ids: selectedProjectIds.length > 0 ? selectedProjectIds : [],
          assignee_ids: selectedUserIds.length > 0 ? selectedUserIds : [],
        };
        response = await fetch(`/api/todos/${todo.id}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(updatePayload),
        });
      } else {
        // Create new todo
        response = await fetch('/api/todos', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        onClose(true); // Refresh on successful save
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error saving todo:', error);
      alert('Error saving task');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose(false); // Don't refresh on cancel
  };

  // Determine if this is a shared or personal task
  const isSharedTask = todo 
    ? (todo.todo_list?.list_type === 'shared' || (todo.project_assignments && todo.project_assignments.length > 0))
    : (activeTab === 'project' || selectedProjectIds.length > 0 || projectId);

  const formTitle = todo 
    ? 'Edit Task' 
    : (isSharedTask ? 'Create New Shared Task' : 'Create New Personal Task');

  return (
    <Dialog open={true} onOpenChange={(open) => {
      if (!open) {
        onClose(false); // Don't refresh when closing dialog
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recurring Meeting Switch (only for shared tasks, at the top) */}
          {isSharedTask && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <Label htmlFor="is_recurring_meeting" className="text-base font-semibold text-blue-900 dark:text-blue-100 cursor-pointer">
                  Is this a recurring meeting?
                </Label>
                <Switch
                  id="is_recurring_meeting"
                  checked={formData.is_recurring_meeting}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_recurring_meeting: checked })}
                />
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as TodoStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority || 'none'}
                onValueChange={(value) => setFormData({ ...formData, priority: value === 'none' ? null : value as TodoPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="due_date">Due Date</Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="experiment, analysis, writing"
            />
          </div>

          {/* Project Assignments */}
          <div>
            <Label className="mb-2 block">Assign to Projects</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Assigning to a project automatically assigns to all current and future project members
            </p>
            <div className="border-2 border-border rounded-lg overflow-hidden">
              <ScrollArea className="h-32">
                <div className="p-3 space-y-2">
                  {loadingProjects ? (
                    <p className="text-sm text-muted-foreground">Loading projects...</p>
                  ) : projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No projects available</p>
                  ) : (
                    projects.map((project) => (
                      <div key={project.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`project-${project.id}`}
                          checked={selectedProjectIds.includes(project.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProjectIds([...selectedProjectIds, project.id]);
                            } else {
                              setSelectedProjectIds(selectedProjectIds.filter(id => id !== project.id));
                            }
                          }}
                        />
                        <Label
                          htmlFor={`project-${project.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {project.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Individual User Assignments */}
          <div>
            <Label className="mb-2 block">Assign to Individual Users</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Assign specific users (in addition to any project assignments)
            </p>
            <div className="border-2 border-border rounded-lg overflow-hidden">
              <ScrollArea className="h-32">
                <div className="p-3 space-y-2">
                  {loadingUsers ? (
                    <p className="text-sm text-muted-foreground">Loading users...</p>
                  ) : allUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users available</p>
                  ) : (
                    allUsers.map((user) => (
                      <div key={user.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`user-${user.id}`}
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedUserIds([...selectedUserIds, user.id]);
                            } else {
                              setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                            }
                          }}
                        />
                        <Label
                          htmlFor={`user-${user.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {user.full_name || user.email || 'Unknown'}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : todo ? 'Update Task' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

