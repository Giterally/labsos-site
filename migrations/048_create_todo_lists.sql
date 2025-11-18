-- Migration 048: Create todo_lists table
-- Supports both personal (user-scoped) and shared (project-scoped) lists

CREATE TABLE IF NOT EXISTS public.todo_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  list_type TEXT NOT NULL CHECK (list_type IN ('personal', 'shared')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Ensure logical consistency: personal lists must have user_id, shared lists must have project_id
  CONSTRAINT todo_lists_type_consistency CHECK (
    (list_type = 'personal' AND user_id IS NOT NULL AND project_id IS NULL) OR
    (list_type = 'shared' AND project_id IS NOT NULL AND user_id IS NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todo_lists_user_id_idx ON public.todo_lists(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS todo_lists_project_id_idx ON public.todo_lists(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS todo_lists_list_type_idx ON public.todo_lists(list_type);
CREATE INDEX IF NOT EXISTS todo_lists_created_at_idx ON public.todo_lists(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own personal lists
CREATE POLICY "Users can view their own personal lists"
  ON public.todo_lists FOR SELECT
  USING (
    list_type = 'personal' 
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can view shared lists for projects they're members of
CREATE POLICY "Users can view shared lists for their projects"
  ON public.todo_lists FOR SELECT
  USING (
    list_type = 'shared' 
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_lists.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Users can create their own personal lists
CREATE POLICY "Users can create personal lists"
  ON public.todo_lists FOR INSERT
  WITH CHECK (
    list_type = 'personal' 
    AND user_id = auth.uid()
  );

-- RLS Policy: Project members can create shared lists
CREATE POLICY "Users can create shared lists for their projects"
  ON public.todo_lists FOR INSERT
  WITH CHECK (
    list_type = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_lists.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Users can update their own personal lists
CREATE POLICY "Users can update their personal lists"
  ON public.todo_lists FOR UPDATE
  USING (
    list_type = 'personal' 
    AND user_id = auth.uid()
  );

-- RLS Policy: Project members can update shared lists
CREATE POLICY "Project members can update shared lists"
  ON public.todo_lists FOR UPDATE
  USING (
    list_type = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_lists.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.left_at IS NULL
    )
  );

-- RLS Policy: Users can delete their own personal lists
CREATE POLICY "Users can delete their personal lists"
  ON public.todo_lists FOR DELETE
  USING (
    list_type = 'personal' 
    AND user_id = auth.uid()
  );

-- RLS Policy: Project admins can delete shared lists
CREATE POLICY "Project admins can delete shared lists"
  ON public.todo_lists FOR DELETE
  USING (
    list_type = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = todo_lists.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role = 'Admin'
      AND project_members.left_at IS NULL
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER handle_todo_lists_updated_at
  BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.todo_lists IS 'Todo lists can be personal (user-scoped) or shared (project-scoped)';
COMMENT ON COLUMN public.todo_lists.list_type IS 'Either ''personal'' or ''shared''';
COMMENT ON COLUMN public.todo_lists.user_id IS 'Set for personal lists, null for shared lists';
COMMENT ON COLUMN public.todo_lists.project_id IS 'Set for shared lists, null for personal lists';

