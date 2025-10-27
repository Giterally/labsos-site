-- Migration 028: Create Permission Helper Functions
-- Centralize permission logic in database functions for RLS policies

-- Helper function to check if user is project member
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_id = p_project_id 
    AND user_id = p_user_id 
    AND left_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is project owner
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM projects 
    WHERE id = p_project_id 
    AND created_by = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user role in project
CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check if owner
  IF is_project_owner(p_project_id, p_user_id) THEN
    RETURN 'Lead Researcher';
  END IF;
  
  -- Get member role
  SELECT role INTO v_role
  FROM project_members
  WHERE project_id = p_project_id 
  AND user_id = p_user_id 
  AND left_at IS NULL;
  
  RETURN COALESCE(v_role, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION is_project_member(UUID, UUID) IS 'Check if user is an active member of the project';
COMMENT ON FUNCTION is_project_owner(UUID, UUID) IS 'Check if user is the owner/creator of the project';
COMMENT ON FUNCTION get_project_role(UUID, UUID) IS 'Get user role in project (Lead Researcher, Admin, Member, Viewer, or NULL)';
