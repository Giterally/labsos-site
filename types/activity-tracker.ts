// Database types for Activity Tracker

export type ListType = 'personal' | 'shared';
export type TodoStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TodoList {
  id: string;
  title: string;
  description: string | null;
  user_id: string | null;
  project_id: string | null;
  list_type: ListType;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  tree_node_id: string | null;
  tags: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TodoAssignment {
  id: string;
  todo_id: string;
  user_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface TodoProjectAssignment {
  id: string;
  todo_id: string;
  project_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface WorkLog {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  log_date: string;
  todo_id: string | null;
  tree_node_id: string | null;
  is_meeting_note: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  edited_at: string | null;
}

export interface TodoComment {
  id: string;
  todo_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
}

// Extended types with relations for UI
export interface TodoWithRelations extends Todo {
  todo_list?: TodoList;
  assignees?: Array<{
    user_id: string;
    user_profile: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    };
  }>;
  project_assignments?: Array<{
    project_id: string;
    project: {
      id: string;
      name: string;
    };
  }>;
  created_by_profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  completed_by_profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  tree_node?: {
    id: string;
    name: string;
  } | null;
  comments_count?: number;
}

export interface WorkLogWithRelations extends WorkLog {
  user_profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  project: {
    id: string;
    name: string;
  };
  todo?: {
    id: string;
    title: string;
  } | null;
  tree_node?: {
    id: string;
    name: string;
  } | null;
}

// API request/response types
export interface CreateTodoListRequest {
  title: string;
  description?: string;
  list_type: ListType;
  project_id?: string;
}

export interface CreateTodoRequest {
  list_id: string;
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  due_date?: string;
  tree_node_id?: string;
  tags?: string[];
  assignee_ids?: string[];
  project_ids?: string[]; // Projects to assign this todo to
}

export interface UpdateTodoRequest {
  title?: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  due_date?: string;
  tree_node_id?: string;
  tags?: string[];
  position?: number;
}

export interface CreateWorkLogRequest {
  project_id: string;
  title: string;
  content: string;
  log_date?: string;
  todo_id?: string;
  tree_node_id?: string;
  is_meeting_note?: boolean;
  tags?: string[];
}

export interface UpdateWorkLogRequest {
  title?: string;
  content?: string;
  log_date?: string;
  todo_id?: string;
  tree_node_id?: string;
  is_meeting_note?: boolean;
  tags?: string[];
}

// Filter types
export interface TodoFilters {
  list_type?: ListType;
  project_id?: string;
  status?: TodoStatus | 'all';
  priority?: TodoPriority | 'all';
  assigned_to?: string;
  created_by?: string;
  tree_node_id?: string;
  show_completed?: boolean;
  search?: string;
}

export interface WorkLogFilters {
  project_id?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  tree_node_id?: string;
  is_meeting_note?: boolean;
  search?: string;
}

