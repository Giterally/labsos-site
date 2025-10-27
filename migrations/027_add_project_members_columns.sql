-- Migration 027: Add Missing Columns to project_members
-- Add left_at column for soft delete support and ensure role column exists

-- Add left_at column if it doesn't exist
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMP WITH TIME ZONE;

-- Ensure role column exists with default
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Member';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_project_members_left_at ON project_members(left_at);
CREATE INDEX IF NOT EXISTS idx_project_members_active ON project_members(project_id, user_id) WHERE left_at IS NULL;

-- Update existing records to ensure they have proper role values
UPDATE project_members 
SET role = 'Member' 
WHERE role IS NULL OR role = '';

-- Add comment explaining the soft delete pattern
COMMENT ON COLUMN project_members.left_at IS 'Timestamp when member left the project. NULL means active member.';
COMMENT ON COLUMN project_members.role IS 'Member role: Lead Researcher, Admin, Member, or Viewer';
