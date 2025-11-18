'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useUser } from '@/lib/user-context';
import { TodoWithRelations, TodoFilters } from '@/types/activity-tracker';
import TodoItem from './TodoItem';
import TodoForm from './TodoForm';
import TodoFiltersComponent from './TodoFilters';
import TodoDetailModal from './TodoDetailModal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2 } from 'lucide-react';

interface TodoListProps {
  initialProjectId?: string;
  initialTreeNodeId?: string;
}

export default function TodoList({ initialProjectId, initialTreeNodeId }: TodoListProps) {
  const { user } = useUser();
  const [todos, setTodos] = useState<TodoWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoWithRelations | null>(null);
  const [viewingTodo, setViewingTodo] = useState<TodoWithRelations | null>(null);
  const [activeTab, setActiveTab] = useState<'my-tasks' | 'project'>('my-tasks');
  
  const [filters, setFilters] = useState<TodoFilters>({
    list_type: 'personal',
    project_id: initialProjectId,
    tree_node_id: initialTreeNodeId,
    status: 'all',
    show_completed: false,
  });

  // Fetch todos
  useEffect(() => {
    fetchTodos();
  }, [filters, activeTab, user]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('todos-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos' },
        () => {
          fetchTodos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, activeTab, user]);

  const fetchTodos = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Adjust filters based on active tab
      const tabFilters: TodoFilters = { ...filters };
      
      if (activeTab === 'my-tasks') {
        tabFilters.list_type = 'personal';
        tabFilters.assigned_to = undefined;
        tabFilters.project_id = undefined;
      } else if (activeTab === 'project') {
        tabFilters.list_type = 'shared';
        tabFilters.assigned_to = undefined; // Show all project tasks (assigned and unassigned)
        tabFilters.project_id = undefined;
      }

      const params = new URLSearchParams();
      if (tabFilters.list_type) params.set('listType', tabFilters.list_type);
      if (tabFilters.project_id) params.set('projectId', tabFilters.project_id);
      if (tabFilters.status && tabFilters.status !== 'all') params.set('status', tabFilters.status);
      if (tabFilters.priority && tabFilters.priority !== 'all') params.set('priority', tabFilters.priority);
      if (tabFilters.assigned_to) params.set('assignedTo', tabFilters.assigned_to);
      if (tabFilters.tree_node_id) params.set('treeNodeId', tabFilters.tree_node_id);
      if (tabFilters.show_completed) params.set('showCompleted', 'true');
      if (tabFilters.search) params.set('search', tabFilters.search);

      const response = await fetch(`/api/todos?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (response.ok) {
        setTodos(data.todos || []);
      } else {
        console.error('Error fetching todos:', data.error);
      }
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTodo = () => {
    setEditingTodo(null);
    setShowForm(true);
  };

  const handleEditTodo = (todo: TodoWithRelations) => {
    setEditingTodo(todo);
    setShowForm(true);
  };

  const handleViewTodo = (todo: TodoWithRelations) => {
    setViewingTodo(todo);
  };

  const handleFormClose = (shouldRefresh?: boolean) => {
    setShowForm(false);
    setEditingTodo(null);
    if (shouldRefresh) {
      fetchTodos();
    }
  };


  const handleDelete = async (todoId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        fetchTodos();
      } else {
        const data = await response.json();
        console.error('Error deleting todo:', data.error);
      }
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-8 text-gray-500">
        Please log in to view tasks
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Tasks</h2>
        <Button onClick={handleCreateTodo}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="my-tasks">Personal Tasks</TabsTrigger>
          <TabsTrigger value="project">Shared Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <TodoFiltersComponent filters={filters} onFiltersChange={setFilters} />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tasks found. Create your first task to get started!
            </div>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onEdit={handleEditTodo}
                  onDelete={handleDelete}
                  onView={handleViewTodo}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

        {showForm && (
          <TodoForm
            todo={editingTodo}
            projectId={initialProjectId}
            treeNodeId={initialTreeNodeId}
            activeTab={activeTab}
            onClose={handleFormClose}
          />
        )}

        <TodoDetailModal
          todo={viewingTodo}
          open={!!viewingTodo}
          onOpenChange={(open) => {
            if (!open) setViewingTodo(null);
          }}
        />
    </div>
  );
}

