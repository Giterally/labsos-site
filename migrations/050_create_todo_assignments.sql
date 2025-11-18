-- Migration 050: Create todo_assignments table
-- Tracks which users are assigned to which todos (many-to-many)

CREATE TABLE IF NOT EXISTS public.todo_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Prevent duplicate assignments
  CONSTRAINT todo_assignments_unique UNIQUE(todo_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todo_assignments_todo_id_idx ON public.todo_assignments(todo_id);
CREATE INDEX IF NOT EXISTS todo_assignments_user_id_idx ON public.todo_assignments(user_id);
CREATE INDEX IF NOT EXISTS todo_assignments_assigned_by_idx ON public.todo_assignments(assigned_by) WHERE assigned_by IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.todo_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view assignments for todos they can access
CREATE POLICY "Users can view assignments for accessible todos"
  ON public.todo_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_assignments.todo_id
    )
  );

-- RLS Policy: Users can create assignments for todos they can access
-- Only project members can be assigned to shared todos
CREATE POLICY "Users can create assignments for accessible todos"
  ON public.todo_assignments FOR INSERT
  WITH CHECK (
    assigned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_assignments.todo_id
    )
    AND (
      -- For personal todos, can only assign to self
      EXISTS (
        SELECT 1 FROM public.todos
        JOIN public.todo_lists ON todo_lists.id = todos.list_id
        WHERE todos.id = todo_assignments.todo_id
        AND todo_lists.list_type = 'personal'
        AND todo_assignments.user_id = auth.uid()
      )
      OR
      -- For shared todos, can assign to any project member
      EXISTS (
        SELECT 1 FROM public.todos
        JOIN public.todo_lists ON todo_lists.id = todos.list_id
        JOIN public.project_members ON project_members.project_id = todo_lists.project_id
        WHERE todos.id = todo_assignments.todo_id
        AND todo_lists.list_type = 'shared'
        AND project_members.user_id = todo_assignments.user_id
        AND project_members.left_at IS NULL
      )
    )
  );

-- RLS Policy: Users can delete assignments they created or that are assigned to them
CREATE POLICY "Users can delete their assignments"
  ON public.todo_assignments FOR DELETE
  USING (
    user_id = auth.uid() 
    OR assigned_by = auth.uid()
  );

-- RLS Policy: Project admins can delete any assignment in shared lists
CREATE POLICY "Project admins can delete assignments in shared lists"
  ON public.todo_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.todos
      JOIN public.todo_lists ON todo_lists.id = todos.list_id
      JOIN public.project_members ON project_members.project_id = todo_lists.project_id
      WHERE todos.id = todo_assignments.todo_id
      AND todo_lists.list_type = 'shared'
      AND project_members.user_id = auth.uid()
      AND project_members.role = 'Admin'
      AND project_members.left_at IS NULL
    )
  );

-- Comments for documentation
COMMENT ON TABLE public.todo_assignments IS 'Tracks user assignments to todos (many-to-many relationship)';
COMMENT ON COLUMN public.todo_assignments.assigned_by IS 'User who created the assignment';

