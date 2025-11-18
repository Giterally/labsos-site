-- Migration 051: Create work_logs table
-- Tracks work accomplishments (replaces Google Slides pattern)

CREATE TABLE IF NOT EXISTS public.work_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  log_date DATE NOT NULL DEFAULT current_date,
  todo_id UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  tree_node_id UUID REFERENCES public.tree_nodes(id) ON DELETE SET NULL,
  is_meeting_note BOOLEAN DEFAULT FALSE NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure log_date is not in the future
  CONSTRAINT work_logs_date_not_future CHECK (log_date <= current_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS work_logs_project_id_idx ON public.work_logs(project_id);
CREATE INDEX IF NOT EXISTS work_logs_user_id_idx ON public.work_logs(user_id);
CREATE INDEX IF NOT EXISTS work_logs_log_date_idx ON public.work_logs(project_id, log_date DESC);
CREATE INDEX IF NOT EXISTS work_logs_todo_id_idx ON public.work_logs(todo_id) WHERE todo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_logs_tree_node_id_idx ON public.work_logs(tree_node_id) WHERE tree_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_logs_tags_idx ON public.work_logs USING GIN(tags);
CREATE INDEX IF NOT EXISTS work_logs_is_meeting_note_idx ON public.work_logs(project_id, is_meeting_note) WHERE is_meeting_note = TRUE;
CREATE INDEX IF NOT EXISTS work_logs_created_at_idx ON public.work_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Project members can view work logs
CREATE POLICY "Project members can view work logs"
  ON public.work_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = work_logs.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Project members can create work logs
CREATE POLICY "Project members can create work logs"
  ON public.work_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = work_logs.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Users can update their own work logs
CREATE POLICY "Users can update their own work logs"
  ON public.work_logs FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policy: Users can delete their own work logs
CREATE POLICY "Users can delete their own work logs"
  ON public.work_logs FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policy: Project admins can delete any work log
CREATE POLICY "Project admins can delete work logs"
  ON public.work_logs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = work_logs.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role = 'Admin'
      AND project_members.left_at IS NULL
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER handle_work_logs_updated_at
  BEFORE UPDATE ON public.work_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to track edits
CREATE OR REPLACE FUNCTION public.handle_work_log_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- If content or title changed, mark as edited
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for edit tracking
CREATE TRIGGER handle_work_log_edit_trigger
  BEFORE UPDATE ON public.work_logs
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title)
  EXECUTE FUNCTION public.handle_work_log_edit();

-- Comments for documentation
COMMENT ON TABLE public.work_logs IS 'Work log entries tracking research accomplishments';
COMMENT ON COLUMN public.work_logs.content IS 'Markdown-formatted content';
COMMENT ON COLUMN public.work_logs.log_date IS 'Date this work was done (not necessarily when logged)';
COMMENT ON COLUMN public.work_logs.is_meeting_note IS 'Whether this log entry is from a meeting';
COMMENT ON COLUMN public.work_logs.edited_at IS 'Timestamp of last content edit (null if never edited)';

