-- Fix API Authentication for RLS Policies
-- This migration documents the code changes made to fix API authentication

-- The issue was that API routes were using Supabase client with anon key,
-- causing auth.uid() to return NULL in RLS policies, preventing proper permission checks.

-- Solution implemented:
-- 1. Created createAuthenticatedClient() helper function in lib/supabase-server.ts
-- 2. Updated API routes to use authenticated client instead of anon key client
-- 3. This ensures auth.uid() works correctly in RLS policies

-- Files modified:
-- - lib/supabase-server.ts: Added createAuthenticatedClient() function
-- - app/api/projects/[projectId]/team/route.ts: Updated GET and POST methods
-- - app/api/projects/route.ts: Updated GET and POST methods  
-- - app/api/outputs/route.ts: Updated POST method
-- - app/api/software/route.ts: Updated POST method

-- This fix resolves:
-- - 500 errors when accessing team members
-- - "You must be a team member to add other members" error
-- - RLS policy enforcement issues in API routes

