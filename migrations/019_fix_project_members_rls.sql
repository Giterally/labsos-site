-- Fix RLS policies for project_members to allow team members to manage other members
-- This fixes the "Failed to add team member" error

-- Enable RLS on project_members table (was disabled)
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view project members" ON public.project_members;
DROP POLICY IF EXISTS "Users can manage project members" ON public.project_members;
DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
DROP POLICY IF EXISTS "project_members_update" ON public.project_members;
DROP POLICY IF EXISTS "project_members_delete" ON public.project_members;

-- Allow project creators and team members to view members
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

-- Allow project creators and team members to insert new members
CREATE POLICY "Project creators and members can add members" ON public.project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_id 
      AND projects.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_id
      AND pm.user_id = auth.uid()
      AND pm.left_at IS NULL
    )
  );

-- Allow project creators and team members to update members
CREATE POLICY "Project creators and members can update members" ON public.project_members
  FOR UPDATE USING (
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

-- Allow project creators to delete members
CREATE POLICY "Project creators can remove members" ON public.project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

-- Allow authenticated users to search for other users' profiles
-- (needed for the team member search functionality)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Authenticated users can view other profiles for search purposes
CREATE POLICY "Authenticated users can search profiles" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
