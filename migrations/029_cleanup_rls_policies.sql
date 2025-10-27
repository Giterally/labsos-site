-- Migration 029: Clean Up RLS Policies
-- Remove overly permissive "Allow all access" policies and standardize

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow all access to node_content" ON node_content;
DROP POLICY IF EXISTS "Allow all access to node_attachments" ON node_attachments;
DROP POLICY IF EXISTS "Allow all access to node_links" ON node_links;
DROP POLICY IF EXISTS "Allow anon select for node_order" ON node_order;
DROP POLICY IF EXISTS "Allow anon insert for node_order" ON node_order;
DROP POLICY IF EXISTS "Allow anon update for node_order" ON node_order;
DROP POLICY IF EXISTS "Allow anon delete for node_order" ON node_order;

-- Standardize project_members policies
DROP POLICY IF EXISTS "Members can view their own memberships" ON project_members;
DROP POLICY IF EXISTS "Project creators can add members" ON project_members;
DROP POLICY IF EXISTS "Project creators can remove members" ON project_members;
DROP POLICY IF EXISTS "Project creators can update members" ON project_members;
DROP POLICY IF EXISTS "Project creators can view members" ON project_members;
DROP POLICY IF EXISTS "Team members can view all project members" ON project_members;

-- Create unified project_members policies
CREATE POLICY "project_members_select" ON project_members FOR SELECT USING (
  -- Can view if you're in the project OR it's your own membership
  user_id = auth.uid() OR
  is_project_owner(project_id, auth.uid()) OR
  is_project_member(project_id, auth.uid())
);

CREATE POLICY "project_members_insert" ON project_members FOR INSERT WITH CHECK (
  -- Only project owner can add members
  is_project_owner(project_id, auth.uid())
);

CREATE POLICY "project_members_update" ON project_members FOR UPDATE USING (
  -- Only project owner can update members
  is_project_owner(project_id, auth.uid())
);

CREATE POLICY "project_members_delete" ON project_members FOR DELETE USING (
  -- Only project owner can remove members
  is_project_owner(project_id, auth.uid())
);

-- Add comments for documentation
COMMENT ON POLICY "project_members_select" ON project_members IS 'Users can view project members if they are in the project or viewing their own membership';
COMMENT ON POLICY "project_members_insert" ON project_members IS 'Only project owners can add new members';
COMMENT ON POLICY "project_members_update" ON project_members IS 'Only project owners can update member details';
COMMENT ON POLICY "project_members_delete" ON project_members IS 'Only project owners can remove members';
