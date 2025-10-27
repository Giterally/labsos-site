-- Fix circular dependencies in RLS policies
-- This resolves the 500 errors by removing circular references between tables

-- 1. Fix project_members table - remove all circular dependencies
DROP POLICY IF EXISTS "Project creators and members can view members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can add members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can update members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can remove members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can manage members" ON public.project_members;

-- Create simple, non-circular policies for project_members
-- Only project creators can manage members (simplest approach)

CREATE POLICY "Project creators can view members" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Project creators can add members" ON public.project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_id 
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Project creators can update members" ON public.project_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Project creators can remove members" ON public.project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

-- 2. Fix profiles table - remove circular dependency
DROP POLICY IF EXISTS "Team members can view each other's profiles" ON public.profiles;

-- 3. Clean up unused function
DROP FUNCTION IF EXISTS is_project_member(UUID, UUID);

