-- Remove project updated_at tracking functionality
-- This migration removes the automatic updated_at timestamp tracking for projects

-- Drop the trigger that automatically updates updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;

-- Note: We keep the updated_at column in the table but it won't be automatically updated
-- This allows for future re-enablement if needed without schema changes
