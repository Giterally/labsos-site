-- Fix Member Removal Authentication
-- This migration documents the fix for the DELETE team member endpoint

-- The issue was that the DELETE endpoint for removing team members was using
-- the anon key client instead of the authenticated client, causing RLS policies
-- to fail and returning "You must be a team member to remove other members" error.

-- Solution implemented:
-- 1. Updated DELETE endpoint to use createAuthenticatedClient() instead of anon key
-- 2. This ensures auth.uid() works correctly in RLS policies
-- 3. Member permission checks now work as intended

-- Files modified:
-- - app/api/projects/[projectId]/team/[memberId]/route.ts: Updated DELETE method

-- This fix resolves:
-- - "You must be a team member to remove other members" error
-- - 406 errors when checking member permissions
-- - RLS policy enforcement issues in member removal

