-- Migration 052: Create todo_comments table
-- Discussion threads on todos (Phase 2, but schema included for completeness)

CREATE TABLE IF NOT EXISTS public.todo_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS todo_comments_todo_id_idx ON public.todo_comments(todo_id, created_at);
CREATE INDEX IF NOT EXISTS todo_comments_user_id_idx ON public.todo_comments(user_id);

-- Enable Row Level Security
ALTER TABLE public.todo_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view comments on todos they can access
CREATE POLICY "Users can view comments on accessible todos"
  ON public.todo_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_comments.todo_id
    )
  );

-- RLS Policy: Users can create comments on todos they can access
CREATE POLICY "Users can create comments on accessible todos"
  ON public.todo_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.todos
      WHERE todos.id = todo_comments.todo_id
    )
  );

-- RLS Policy: Users can update their own comments
CREATE POLICY "Users can update their own comments"
  ON public.todo_comments FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policy: Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON public.todo_comments FOR DELETE
  USING (user_id = auth.uid());

-- Trigger to auto-update updated_at
CREATE TRIGGER handle_todo_comments_updated_at
  BEFORE UPDATE ON public.todo_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to track comment edits
CREATE OR REPLACE FUNCTION public.handle_comment_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for comment edit tracking
CREATE TRIGGER handle_comment_edit_trigger
  BEFORE UPDATE ON public.todo_comments
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION public.handle_comment_edit();

-- Comments for documentation
COMMENT ON TABLE public.todo_comments IS 'Comments and discussion on todos';
COMMENT ON COLUMN public.todo_comments.edited_at IS 'Timestamp of last edit (null if never edited)';

