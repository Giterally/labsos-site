-- Final fix for project_members RLS policies to resolve 500 error
-- This creates a proper RLS policy that avoids circular dependencies

-- Create a helper function to check if a user is a project member
-- This avoids circular dependencies in RLS policies
CREATE OR REPLACE FUNCTION is_project_member(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_uuid
    AND pm.user_id = user_uuid
    AND pm.left_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Project creators and members can view members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can add members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can update members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can remove members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can add members v2" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can manage members" ON public.project_members;

-- Create a single comprehensive policy that handles all operations
-- This policy allows project creators and team members to manage project members
CREATE POLICY "Project creators and members can manage members" ON public.project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
    OR
    is_project_member(project_members.project_id, auth.uid())
  );

