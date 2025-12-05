import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { TodoFilters, CreateTodoRequest, TodoWithRelations } from '@/types/activity-tracker';

export const dynamic = 'force-dynamic';

// GET /api/todos
// Query params: listType, projectId, status, priority, assignedTo, treeNodeId, showCompleted, search
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const filters: TodoFilters = {
      list_type: searchParams.get('listType') as 'personal' | 'shared' | undefined,
      project_id: searchParams.get('projectId') || undefined,
      linked_project_id: searchParams.get('linkedProjectId') || undefined,
      status: (searchParams.get('status') as any) || 'all',
      priority: (searchParams.get('priority') as any) || 'all',
      assigned_to: searchParams.get('assignedTo') || undefined,
      tree_node_id: searchParams.get('treeNodeId') || undefined,
      show_completed: searchParams.get('showCompleted') === 'true',
      search: searchParams.get('search') || undefined,
    };

    // Build query
    let query = supabase
      .from('todos')
      .select(`
        *,
        todo_list:todo_lists!inner(*),
        assignees:todo_assignments(
          user_id,
          user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
        ),
        project_assignments:todo_project_assignments(
          project_id,
          project:projects(id, name)
        ),
        project_links:todo_project_links(
          project_id,
          project:projects(id, name)
        ),
        created_by_profile:profiles!todos_created_by_fkey(id, full_name, avatar_url),
        completed_by_profile:profiles!todos_completed_by_fkey(id, full_name, avatar_url),
        tree_node:tree_nodes(id, name)
      `)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.list_type) {
      query = query.eq('todo_list.list_type', filters.list_type);
    }

    if (filters.project_id) {
      query = query.eq('todo_list.project_id', filters.project_id);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      query = query.eq('priority', filters.priority);
    }

    if (filters.tree_node_id) {
      query = query.eq('tree_node_id', filters.tree_node_id);
    }

    if (!filters.show_completed) {
      // Hide completed items older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      query = query.or(
        `status.neq.completed,and(status.eq.completed,completed_at.gte.${thirtyDaysAgo.toISOString()})`
      );
    }

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data: todos, error } = await query;

    if (error) {
      console.error('Error fetching todos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Post-filter by assigned_to and linked_project_id (needs to be done after fetch due to relation)
    let filteredTodos = (todos || []) as TodoWithRelations[];
    
    if (filters.linked_project_id) {
      filteredTodos = filteredTodos.filter(todo => 
        todo.project_links?.some(pl => pl.project_id === filters.linked_project_id)
      );
    }
    
    if (filters.assigned_to) {
      filteredTodos = filteredTodos.filter(todo =>
        todo.assignees?.some(a => a.user_id === filters.assigned_to)
      );
    }

    // STRICT FILTERING: Ensure only the correct type of tasks appear in each tab
    
    if (filters.list_type === 'personal') {
      // PERSONAL TASKS: Only show todos in personal lists with NO project assignments
      
      // Get all todos that have project assignments (for user's projects)
      const { data: userProjects } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id)
        .is('left_at', null);
      
      const todosWithProjectAssignments = new Set<string>();
      if (userProjects && userProjects.length > 0) {
        const userProjectIds = userProjects.map(p => p.project_id);
        const { data: projectAssignments } = await supabase
          .from('todo_project_assignments')
          .select('todo_id')
          .in('project_id', userProjectIds);
        
        if (projectAssignments) {
          projectAssignments.forEach(pa => todosWithProjectAssignments.add(pa.todo_id));
        }
      }

      // Filter: ONLY keep todos that are:
      // 1. In a personal list (already filtered by query, but double-check)
      // 2. Have NO project assignments
      filteredTodos = filteredTodos.filter(todo => {
        // Must be in a personal list
        if (todo.todo_list?.list_type !== 'personal') {
          return false;
        }
        
        // Must NOT have project assignments in loaded data
        if (todo.project_assignments && Array.isArray(todo.project_assignments) && todo.project_assignments.length > 0) {
          return false;
        }
        
        // Must NOT be assigned to any project (database check)
        if (todosWithProjectAssignments.has(todo.id)) {
          return false;
        }
        
        return true;
      });
    }

    if (filters.list_type === 'shared') {
      // SHARED TASKS: Show todos in shared lists OR with project assignments
      
      // Get user's projects
      const { data: projectMembers } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id)
        .is('left_at', null);

      if (projectMembers && projectMembers.length > 0) {
        const projectIds = projectMembers.map(pm => pm.project_id);
        
        // Get todo IDs assigned to these projects
        const { data: projectAssignments } = await supabase
          .from('todo_project_assignments')
          .select('todo_id')
          .in('project_id', projectIds);

        if (projectAssignments && projectAssignments.length > 0) {
          const projectAssignedTodoIds = projectAssignments.map(pa => pa.todo_id);
          
          // Get todos assigned to these projects (even if in personal lists)
          const { data: projectAssignedTodos } = await supabase
            .from('todos')
            .select(`
              *,
              todo_list:todo_lists(*),
              assignees:todo_assignments(
                user_id,
                user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
              ),
              project_assignments:todo_project_assignments(
                project_id,
                project:projects(id, name)
              ),
              created_by_profile:profiles!todos_created_by_fkey(id, full_name, avatar_url),
              completed_by_profile:profiles!todos_completed_by_fkey(id, full_name, avatar_url),
              tree_node:tree_nodes(id, name)
            `)
            .in('id', projectAssignedTodoIds);

          // Merge project-assigned todos with shared list todos (avoid duplicates)
          const existingTodoIds = new Set(filteredTodos.map(t => t.id));
          if (projectAssignedTodos) {
            projectAssignedTodos.forEach((todo: TodoWithRelations) => {
              // Only add if not already in the list and ensure it's not in a personal list
              // (though project assignments make it shared regardless)
              if (!existingTodoIds.has(todo.id)) {
                filteredTodos.push(todo);
              }
            });
          }
        }
      }
      
      // Final filter: ONLY keep todos that are:
      // 1. In a shared list, OR
      // 2. Have project assignments
      filteredTodos = filteredTodos.filter(todo => {
        // If in a shared list, include it
        if (todo.todo_list?.list_type === 'shared') {
          return true;
        }
        
        // If has project assignments, include it (even if in personal list)
        if (todo.project_assignments && Array.isArray(todo.project_assignments) && todo.project_assignments.length > 0) {
          return true;
        }
        
        // Otherwise exclude
        return false;
      });
    }

    // For recurring meetings, fetch meeting updates count and last update date
    // Include both filteredTodos and any project-assigned todos that might have been added
    const allTodos = [...filteredTodos];
    const recurringMeetingTodos = allTodos.filter(todo => todo.is_recurring_meeting);
    if (recurringMeetingTodos.length > 0) {
      const recurringTodoIds = recurringMeetingTodos.map(todo => todo.id);
      
      // Get meeting updates count and last update date for each recurring meeting
      const { data: meetingUpdates } = await supabase
        .from('todo_meeting_updates')
        .select('todo_id, created_at')
        .in('todo_id', recurringTodoIds)
        .order('created_at', { ascending: false });

      if (meetingUpdates) {
        // Group by todo_id and calculate count and last update date
        const updatesByTodo = new Map<string, { count: number; lastUpdate: string }>();
        
        meetingUpdates.forEach(update => {
          const existing = updatesByTodo.get(update.todo_id);
          if (!existing) {
            // First occurrence for this todo (most recent since sorted desc)
            updatesByTodo.set(update.todo_id, {
              count: 1,
              lastUpdate: update.created_at
            });
          } else {
            // Increment count, lastUpdate already set from first (most recent) entry
            existing.count++;
          }
        });

        // Add the counts and dates to the todos
        allTodos.forEach(todo => {
          if (todo.is_recurring_meeting) {
            const updates = updatesByTodo.get(todo.id);
            if (updates) {
              todo.meeting_updates_count = updates.count;
              todo.last_meeting_update_date = updates.lastUpdate;
            } else {
              todo.meeting_updates_count = 0;
              todo.last_meeting_update_date = null;
            }
          }
        });
      } else {
        // No updates found, set to 0
        recurringMeetingTodos.forEach(todo => {
          todo.meeting_updates_count = 0;
          todo.last_meeting_update_date = null;
        });
      }
    }

    return NextResponse.json({ todos: filteredTodos });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/todos:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/todos
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const body: CreateTodoRequest = await request.json();

    // Validate required fields
    if (!body.list_id || !body.title) {
      return NextResponse.json(
        { error: 'list_id and title are required' },
        { status: 400 }
      );
    }

    // Verify user has access to the list
    const { data: list, error: listError } = await supabase
      .from('todo_lists')
      .select('*')
      .eq('id', body.list_id)
      .single();

    if (listError || !list) {
      return NextResponse.json(
        { error: 'Todo list not found or access denied' },
        { status: 404 }
      );
    }

    // Get the next position for this list
    const { data: lastTodo } = await supabase
      .from('todos')
      .select('position')
      .eq('list_id', body.list_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = lastTodo ? lastTodo.position + 1 : 0;

    // Create the todo
    const { data: todo, error: todoError } = await supabase
      .from('todos')
      .insert({
        list_id: body.list_id,
        title: body.title,
        description: body.description || null,
        is_recurring_meeting: body.is_recurring_meeting || false,
        priority: body.priority || null,
        due_date: body.due_date || null,
        tree_node_id: body.tree_node_id || null,
        tags: body.tags || [],
        position: nextPosition,
        created_by: user.id,
        status: body.status || 'not_started',
        // linked_project_id removed - using todo_project_links table instead
      })
      .select(`
        *,
        todo_list:todo_lists(*),
        created_by_profile:profiles!todos_created_by_fkey(id, full_name, avatar_url),
        tree_node:tree_nodes(id, name)
      `)
      .single();

    if (todoError) {
      console.error('Error creating todo:', todoError);
      return NextResponse.json({ error: todoError.message }, { status: 500 });
    }

    // Handle individual user assignments if provided
    if (body.assignee_ids && body.assignee_ids.length > 0) {
      const assignments = body.assignee_ids.map(user_id => ({
        todo_id: todo.id,
        user_id,
        assigned_by: user.id,
      }));

      const { error: assignError } = await supabase
        .from('todo_assignments')
        .insert(assignments);

      if (assignError) {
        console.error('Error creating assignments:', assignError);
        // Don't fail the whole request if assignments fail
      }
    }

    // Handle project assignments if provided (for shared tasks)
    if (body.project_ids && body.project_ids.length > 0) {
      const projectAssignments = body.project_ids.map(project_id => ({
        todo_id: todo.id,
        project_id,
        assigned_by: user.id,
      }));

      const { error: projectAssignError } = await supabase
        .from('todo_project_assignments')
        .insert(projectAssignments);

      if (projectAssignError) {
        console.error('Error creating project assignments:', projectAssignError);
        // Don't fail the whole request if assignments fail
      }
    }

    // Handle project links if provided (for personal tasks)
    if (body.linked_project_ids && body.linked_project_ids.length > 0) {
      const projectLinks = body.linked_project_ids.map(project_id => ({
        todo_id: todo.id,
        project_id,
      }));

      const { error: projectLinksError } = await supabase
        .from('todo_project_links')
        .insert(projectLinks);

      if (projectLinksError) {
        console.error('Error creating project links:', projectLinksError);
        // Don't fail the whole request if links fail
      }
    }

    // Fetch all assignments for response
    const { data: assignees } = await supabase
      .from('todo_assignments')
      .select(`
        user_id,
        user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
      `)
      .eq('todo_id', todo.id);

    const { data: projectAssignments } = await supabase
      .from('todo_project_assignments')
      .select(`
        project_id,
        project:projects(id, name)
      `)
      .eq('todo_id', todo.id);

    const { data: projectLinks } = await supabase
      .from('todo_project_links')
      .select(`
        project_id,
        project:projects(id, name)
      `)
      .eq('todo_id', todo.id);

    (todo as TodoWithRelations).assignees = assignees || [];
    (todo as TodoWithRelations).project_assignments = projectAssignments || [];
    (todo as TodoWithRelations).project_links = projectLinks || [];

    return NextResponse.json({ todo }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

