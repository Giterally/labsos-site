-- Migration 055: Update projects visibility constraint to include 'stealth'
-- Drop the existing constraint
ALTER TABLE public.projects 
DROP CONSTRAINT IF EXISTS projects_visibility_check;

-- Add new constraint that includes 'stealth'
ALTER TABLE public.projects 
ADD CONSTRAINT projects_visibility_check 
CHECK (visibility = ANY (ARRAY['public'::text, 'private'::text, 'stealth'::text]));

