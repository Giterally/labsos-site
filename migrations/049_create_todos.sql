-- Migration 049: Create todos table
-- Individual todo items belonging to todo_lists

CREATE TABLE IF NOT EXISTS public.todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  tree_node_id UUID REFERENCES public.tree_nodes(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todos_list_id_idx ON public.todos(list_id);
CREATE INDEX IF NOT EXISTS todos_status_idx ON public.todos(status);
CREATE INDEX IF NOT EXISTS todos_created_by_idx ON public.todos(created_by);
CREATE INDEX IF NOT EXISTS todos_tree_node_id_idx ON public.todos(tree_node_id) WHERE tree_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS todos_due_date_idx ON public.todos(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS todos_tags_idx ON public.todos USING GIN(tags);
CREATE INDEX IF NOT EXISTS todos_position_idx ON public.todos(list_id, position);
CREATE INDEX IF NOT EXISTS todos_completed_at_idx ON public.todos(completed_at) WHERE completed_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view todos in lists they have access to
-- This inherits permissions from todo_lists through the foreign key
CREATE POLICY "Users can view todos in accessible lists"
  ON public.todos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE todo_lists.id = todos.list_id
    )
  );

-- RLS Policy: Users can create todos in lists they have access to
CREATE POLICY "Users can create todos in accessible lists"
  ON public.todos FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE todo_lists.id = todos.list_id
    )
  );

-- RLS Policy: Users can update todos in lists they have access to
CREATE POLICY "Users can update todos in accessible lists"
  ON public.todos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE todo_lists.id = todos.list_id
    )
  );

-- RLS Policy: Users can delete todos they created
CREATE POLICY "Users can delete todos they created"
  ON public.todos FOR DELETE
  USING (created_by = auth.uid());

-- RLS Policy: Project admins can delete any todo in shared lists
CREATE POLICY "Project admins can delete todos in shared lists"
  ON public.todos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      JOIN public.project_members ON project_members.project_id = todo_lists.project_id
      WHERE todo_lists.id = todos.list_id
      AND todo_lists.list_type = 'shared'
      AND project_members.user_id = auth.uid()
      AND project_members.role = 'Admin'
      AND project_members.left_at IS NULL
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER handle_todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to auto-set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION public.handle_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is being set to completed and completed_at is not set
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = now();
    NEW.completed_by = auth.uid();
  -- If status is being changed from completed to something else
  ELSIF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at = NULL;
    NEW.completed_by = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-completion
CREATE TRIGGER handle_todo_completion_trigger
  BEFORE UPDATE ON public.todos
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_todo_completion();

-- Comments for documentation
COMMENT ON TABLE public.todos IS 'Individual todo items within todo lists';
COMMENT ON COLUMN public.todos.status IS 'Current status: not_started, in_progress, blocked, or completed';
COMMENT ON COLUMN public.todos.priority IS 'Priority level: low, medium, high, or urgent';
COMMENT ON COLUMN public.todos.completed_by IS 'User who marked the todo as completed';
COMMENT ON COLUMN public.todos.tree_node_id IS 'Optional link to experiment tree node';
COMMENT ON COLUMN public.todos.position IS 'Position within the list for ordering';

