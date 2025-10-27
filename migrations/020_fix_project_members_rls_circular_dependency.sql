-- Fix the circular dependency issue causing 500 error
-- This resolves the RLS policy circular dependency where checking project_members
-- requires querying project_members itself, creating an infinite loop

DROP POLICY IF EXISTS "Project creators and members can view members" ON public.project_members;

CREATE POLICY "Project creators and members can view members" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_members.project_id
      AND pm.user_id = auth.uid()
      AND pm.left_at IS NULL
    )
  );

