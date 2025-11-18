import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { WorkLogFilters, CreateWorkLogRequest, WorkLogWithRelations } from '@/types/activity-tracker';
import { PermissionService } from '@/lib/permission-service';

export const dynamic = 'force-dynamic';

// GET /api/work-logs
// Query params: projectId, userId, startDate, endDate, treeNodeId, isMeetingNote, search
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const filters: WorkLogFilters = {
      project_id: searchParams.get('projectId') || undefined,
      user_id: searchParams.get('userId') || undefined,
      start_date: searchParams.get('startDate') || undefined,
      end_date: searchParams.get('endDate') || undefined,
      tree_node_id: searchParams.get('treeNodeId') || undefined,
      is_meeting_note: searchParams.get('isMeetingNote') === 'true' || undefined,
      search: searchParams.get('search') || undefined,
    };

    // If filtering by project_id, verify user is a project member
    // Work logs should ONLY be visible to project members, even for public projects
    if (filters.project_id) {
      const permissionService = new PermissionService(supabase, user.id);
      const permissions = await permissionService.checkProjectAccess(filters.project_id);
      
      // Only allow viewing work logs if user is a project member (not just public access)
      if (!permissions.isMember) {
        return NextResponse.json(
          { error: 'Work logs are only visible to project members' },
          { status: 403 }
        );
      }
    }

    let query = supabase
      .from('work_logs')
      .select(`
        *,
        user_profile:profiles!work_logs_user_id_fkey(id, full_name, avatar_url),
        project:projects(id, name),
        todo:todos(id, title),
        tree_node:tree_nodes(id, name)
      `)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.project_id) {
      query = query.eq('project_id', filters.project_id);
    }

    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    if (filters.start_date) {
      query = query.gte('log_date', filters.start_date);
    }

    if (filters.end_date) {
      query = query.lte('log_date', filters.end_date);
    }

    if (filters.tree_node_id) {
      query = query.eq('tree_node_id', filters.tree_node_id);
    }

    if (filters.is_meeting_note !== undefined) {
      query = query.eq('is_meeting_note', filters.is_meeting_note);
    }

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
    }

    const { data: workLogs, error } = await query;

    if (error) {
      console.error('Error fetching work logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Post-filter: If work logs were fetched without a project filter, 
    // ensure we only return logs from projects where the user is a member
    // This handles cases where user_id filter is used but we still need to check project membership
    if (!filters.project_id && workLogs && workLogs.length > 0) {
      // Get all unique project IDs from the work logs
      const projectIds = [...new Set(workLogs.map(log => log.project_id).filter(Boolean))];
      
      if (projectIds.length > 0) {
        // Check which projects the user is a member of
        const { data: memberships } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', user.id)
          .in('project_id', projectIds)
          .is('left_at', null);
        
        const memberProjectIds = new Set(
          memberships?.map(m => m.project_id) || []
        );
        
        // Filter work logs to only include those from projects where user is a member
        const filteredLogs = workLogs.filter(log => 
          !log.project_id || memberProjectIds.has(log.project_id)
        );
        
        return NextResponse.json({ workLogs: filteredLogs });
      }
    }

    return NextResponse.json({ workLogs });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/work-logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/work-logs
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const body: CreateWorkLogRequest = await request.json();

    if (!body.project_id || !body.title || !body.content) {
      return NextResponse.json(
        { error: 'project_id, title, and content are required' },
        { status: 400 }
      );
    }

    // Verify user is a project member using PermissionService
    const permissionService = new PermissionService(supabase, user.id);
    const permissions = await permissionService.checkProjectAccess(body.project_id);
    
    if (!permissions.canRead) {
      return NextResponse.json(
        { error: 'You must be a project member to create work logs' },
        { status: 403 }
      );
    }

    const { data: workLog, error } = await supabase
      .from('work_logs')
      .insert({
        project_id: body.project_id,
        user_id: user.id,
        title: body.title,
        content: body.content,
        log_date: body.log_date || new Date().toISOString().split('T')[0],
        todo_id: body.todo_id || null,
        tree_node_id: body.tree_node_id || null,
        is_meeting_note: body.is_meeting_note || false,
        tags: body.tags || [],
      })
      .select(`
        *,
        user_profile:profiles!work_logs_user_id_fkey(id, full_name, avatar_url),
        project:projects(id, name),
        todo:todos(id, title),
        tree_node:tree_nodes(id, name)
      `)
      .single();

    if (error) {
      console.error('Error creating work log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workLog }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/work-logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

