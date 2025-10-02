# Supabase Integration Guide

## What We've Set Up

### 1. Database Schema ✅
- **File**: `updated-supabase-schema.sql`
- **What it does**: Complete database schema with all tables needed for the app
- **Tables created**: profiles, projects, project_members, past_members, related_projects, experiment_trees, tree_nodes, software, datasets, outputs, and junction tables
- **Security**: Row Level Security (RLS) policies to ensure users only see their own data

### 2. Supabase Client Configuration ✅
- **File**: `lib/supabase.ts`
- **What it does**: Properly configured Supabase client with auth settings
- **Features**: Auto-refresh tokens, session persistence, URL detection

### 3. Database Service Layer ✅
- **File**: `lib/database-service.ts`
- **What it does**: Complete service layer for all database operations
- **Functions**: CRUD operations for projects, experiment trees, software, datasets, outputs
- **Features**: User authentication checks, data transformation, error handling

### 4. API Routes ✅
- **Files**: `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, etc.
- **What it does**: RESTful API endpoints that use the database service
- **Features**: Proper error handling, user authentication, data validation

### 5. Authentication Service ✅
- **File**: `lib/auth-service.ts`
- **What it does**: Complete authentication system using Supabase Auth
- **Features**: Sign up, sign in, sign out, profile management, auth state listening

## What You Need to Do

### Step 1: Update Database Schema
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `updated-supabase-schema.sql`
4. Run the SQL script
5. This will create all necessary tables and security policies

### Step 2: Update Authentication
The app currently uses localStorage for authentication. You need to:

1. **Update login page** to use Supabase Auth instead of localStorage
2. **Update dashboard** to use Supabase Auth instead of localStorage
3. **Update project page** to use Supabase Auth instead of localStorage
4. **Add auth state management** to handle user sessions

### Step 3: Update Forms
The forms for adding experiment trees, software, datasets, and outputs need to:

1. **Use the new API endpoints** instead of mock data
2. **Handle authentication** properly
3. **Show loading states** and error messages
4. **Refresh data** after successful creation

### Step 4: Test Everything
1. **Create a new user account** in Supabase Auth
2. **Test project creation** and see if it appears in the database
3. **Test adding experiment trees, software, datasets, outputs**
4. **Verify data persistence** across page refreshes
5. **Test user isolation** (users should only see their own data)

## Current Issues to Fix

### 1. Authentication Mismatch
- **Problem**: App uses localStorage, but Supabase uses proper auth
- **Solution**: Replace all localStorage auth with Supabase Auth

### 2. Data Structure Mismatch
- **Problem**: Mock data structure doesn't match database schema
- **Solution**: Update components to use the new data structure

### 3. Form Integration
- **Problem**: Forms don't actually save data to database
- **Solution**: Connect forms to the new API endpoints

### 4. Error Handling
- **Problem**: No proper error handling for database operations
- **Solution**: Add error boundaries and user feedback

## Next Steps

1. **Run the database schema** in Supabase
2. **Update authentication** in the app
3. **Test basic functionality** (login, create project)
4. **Update forms** to save data
5. **Add error handling** and loading states
6. **Test thoroughly** with multiple users

## Files to Update

### High Priority
- `app/login/page.tsx` - Replace localStorage with Supabase Auth
- `app/dashboard/page.tsx` - Replace localStorage with Supabase Auth
- `app/project/[projectId]/page.tsx` - Replace localStorage with Supabase Auth
- All form components in `components/forms/` - Connect to new APIs

### Medium Priority
- Add loading states and error handling
- Update data types and interfaces
- Add proper error boundaries

### Low Priority
- Add real-time updates using Supabase real-time
- Add file upload functionality
- Add advanced search and filtering

## Testing Checklist

- [ ] User can sign up with email/password
- [ ] User can sign in and stay logged in
- [ ] User can create a new project
- [ ] User can add experiment trees to a project
- [ ] User can add software to a project
- [ ] User can add datasets to a project
- [ ] User can add outputs to a project
- [ ] Data persists across page refreshes
- [ ] Users only see their own data
- [ ] Error handling works properly
- [ ] Loading states show during operations

## Support

If you run into issues:
1. Check the browser console for errors
2. Check the Supabase dashboard for database errors
3. Verify environment variables are set correctly
4. Make sure RLS policies are working correctly
