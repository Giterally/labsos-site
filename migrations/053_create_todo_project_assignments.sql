-- Migration 053: Create todo_project_assignments table
-- Tracks which projects a todo is assigned to (for auto-assignment to all project members)

CREATE TABLE IF NOT EXISTS public.todo_project_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Prevent duplicate project assignments
  CONSTRAINT todo_project_assignments_unique UNIQUE(todo_id, project_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todo_project_assignments_todo_id_idx ON public.todo_project_assignments(todo_id);
CREATE INDEX IF NOT EXISTS todo_project_assignments_project_id_idx ON public.todo_project_assignments(project_id);
CREATE INDEX IF NOT EXISTS todo_project_assignments_assigned_by_idx ON public.todo_project_assignments(assigned_by) WHERE assigned_by IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.todo_project_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view project assignments for todos they can access
CREATE POLICY "Users can view project assignments for accessible todos"
  ON public.todo_project_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_project_assignments.todo_id
    )
  );

-- RLS Policy: Users can create project assignments for todos they can access
CREATE POLICY "Users can create project assignments for accessible todos"
  ON public.todo_project_assignments FOR INSERT
  WITH CHECK (
    assigned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_project_assignments.todo_id
    )
    AND EXISTS (
      -- Must be a member of the project being assigned
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_project_assignments.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Users can delete project assignments they created
CREATE POLICY "Users can delete project assignments they created"
  ON public.todo_project_assignments FOR DELETE
  USING (
    assigned_by = auth.uid()
    OR EXISTS (
      -- Project admins can delete any assignment for their project
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_project_assignments.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role = 'Admin'
      AND project_members.left_at IS NULL
    )
  );

-- Function to sync user assignments when a project is assigned to a todo
CREATE OR REPLACE FUNCTION public.sync_todo_project_assignments()
RETURNS TRIGGER AS $$
BEGIN
  -- When a project is assigned to a todo, assign all current project members
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.todo_assignments (todo_id, user_id, assigned_by)
    SELECT 
      NEW.todo_id,
      pm.user_id,
      NEW.assigned_by
    FROM public.project_members pm
    WHERE pm.project_id = NEW.project_id
      AND pm.left_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.todo_assignments ta
        WHERE ta.todo_id = NEW.todo_id
          AND ta.user_id = pm.user_id
      )
    ON CONFLICT (todo_id, user_id) DO NOTHING;
    
    RETURN NEW;
  END IF;
  
  -- When a project assignment is removed, remove assignments for users who are only in that project
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.todo_assignments ta
    WHERE ta.todo_id = OLD.todo_id
      AND ta.user_id IN (
        SELECT pm.user_id
        FROM public.project_members pm
        WHERE pm.project_id = OLD.project_id
          AND pm.left_at IS NULL
      )
      AND NOT EXISTS (
        -- Only remove if user is not assigned via another project assignment
        SELECT 1 FROM public.todo_project_assignments tpa
        JOIN public.project_members pm2 ON pm2.project_id = tpa.project_id
        WHERE tpa.todo_id = OLD.todo_id
          AND tpa.id != OLD.id
          AND pm2.user_id = ta.user_id
          AND pm2.left_at IS NULL
      );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync assignments when project is assigned/unassigned
CREATE TRIGGER sync_todo_project_assignments_trigger
  AFTER INSERT OR DELETE ON public.todo_project_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_todo_project_assignments();

-- Function to sync assignments when a project member joins
CREATE OR REPLACE FUNCTION public.sync_todo_assignments_on_member_join()
RETURNS TRIGGER AS $$
BEGIN
  -- When a member joins a project, assign them to all todos assigned to that project
  IF NEW.left_at IS NULL THEN
    INSERT INTO public.todo_assignments (todo_id, user_id, assigned_by)
    SELECT 
      tpa.todo_id,
      NEW.user_id,
      tpa.assigned_by
    FROM public.todo_project_assignments tpa
    WHERE tpa.project_id = NEW.project_id
      AND NOT EXISTS (
        SELECT 1 FROM public.todo_assignments ta
        WHERE ta.todo_id = tpa.todo_id
          AND ta.user_id = NEW.user_id
      )
    ON CONFLICT (todo_id, user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync assignments when project member joins
CREATE TRIGGER sync_todo_assignments_on_member_join_trigger
  AFTER INSERT OR UPDATE ON public.project_members
  FOR EACH ROW
  WHEN (NEW.left_at IS NULL)
  EXECUTE FUNCTION public.sync_todo_assignments_on_member_join();

-- Function to sync assignments when a project member leaves
CREATE OR REPLACE FUNCTION public.sync_todo_assignments_on_member_leave()
RETURNS TRIGGER AS $$
BEGIN
  -- When a member leaves a project, remove their assignments for todos assigned to that project
  -- Only if they're not assigned via another project
  IF NEW.left_at IS NOT NULL AND (OLD.left_at IS NULL OR OLD.left_at IS NULL) THEN
    DELETE FROM public.todo_assignments ta
    WHERE ta.user_id = NEW.user_id
      AND ta.todo_id IN (
        SELECT tpa.todo_id
        FROM public.todo_project_assignments tpa
        WHERE tpa.project_id = NEW.project_id
      )
      AND NOT EXISTS (
        -- Only remove if user is not assigned via another project assignment
        SELECT 1 FROM public.todo_project_assignments tpa2
        JOIN public.project_members pm ON pm.project_id = tpa2.project_id
        WHERE tpa2.todo_id = ta.todo_id
          AND pm.user_id = NEW.user_id
          AND pm.left_at IS NULL
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync assignments when project member leaves
CREATE TRIGGER sync_todo_assignments_on_member_leave_trigger
  AFTER UPDATE ON public.project_members
  FOR EACH ROW
  WHEN (NEW.left_at IS NOT NULL AND (OLD.left_at IS NULL OR OLD.left_at IS NULL))
  EXECUTE FUNCTION public.sync_todo_assignments_on_member_leave();

-- Comments for documentation
COMMENT ON TABLE public.todo_project_assignments IS 'Tracks project assignments to todos (auto-assigns to all project members)';
COMMENT ON COLUMN public.todo_project_assignments.assigned_by IS 'User who created the project assignment';

