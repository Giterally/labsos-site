-- Migration 054: Add recurring meeting support to todos
-- Adds is_recurring_meeting field and todo_meeting_updates table

-- Add is_recurring_meeting field to todos
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS is_recurring_meeting BOOLEAN DEFAULT FALSE;

-- Create todo_meeting_updates table for recurring meeting updates
CREATE TABLE IF NOT EXISTS public.todo_meeting_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todo_meeting_updates_todo_id_idx ON public.todo_meeting_updates(todo_id);
CREATE INDEX IF NOT EXISTS todo_meeting_updates_created_at_idx ON public.todo_meeting_updates(todo_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.todo_meeting_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view meeting updates for todos they have access to
CREATE POLICY "Users can view meeting updates for accessible todos"
  ON public.todo_meeting_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todos
      JOIN public.todo_lists ON todo_lists.id = todos.list_id
      WHERE todos.id = todo_meeting_updates.todo_id
    )
  );

-- RLS Policy: Users can create meeting updates for todos they have access to
CREATE POLICY "Users can create meeting updates for accessible todos"
  ON public.todo_meeting_updates FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.todos
      JOIN public.todo_lists ON todo_lists.id = todos.list_id
      WHERE todos.id = todo_meeting_updates.todo_id
    )
  );

-- RLS Policy: Users can update meeting updates they created or for shared todos they're members of
CREATE POLICY "Users can update meeting updates"
  ON public.todo_meeting_updates FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.todos
      JOIN public.todo_lists ON todo_lists.id = todos.list_id
      WHERE todos.id = todo_meeting_updates.todo_id
      AND (
        todo_lists.list_type = 'shared'
        OR EXISTS (
          SELECT 1 FROM public.todo_assignments
          WHERE todo_assignments.todo_id = todos.id
          AND todo_assignments.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policy: Users can delete meeting updates they created or for shared todos they're members of
CREATE POLICY "Users can delete meeting updates"
  ON public.todo_meeting_updates FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.todos
      JOIN public.todo_lists ON todo_lists.id = todos.list_id
      WHERE todos.id = todo_meeting_updates.todo_id
      AND (
        todo_lists.list_type = 'shared'
        OR EXISTS (
          SELECT 1 FROM public.todo_assignments
          WHERE todo_assignments.todo_id = todos.id
          AND todo_assignments.user_id = auth.uid()
        )
      )
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER handle_todo_meeting_updates_updated_at
  BEFORE UPDATE ON public.todo_meeting_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comments for documentation
COMMENT ON COLUMN public.todos.is_recurring_meeting IS 'Whether this todo is a recurring meeting that can have multiple dated updates';
COMMENT ON TABLE public.todo_meeting_updates IS 'Updates/additions for recurring meeting todos, forming a continuous timeline';

