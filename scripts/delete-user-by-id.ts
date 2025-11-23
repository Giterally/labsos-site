/**
 * Script to delete a user account by user ID
 * Usage: tsx scripts/delete-user-by-id.ts <userId>
 * 
 * This script requires SUPABASE_SERVICE_ROLE_KEY to be set in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

const userId = process.argv[2]

if (!userId) {
  console.error('Error: User ID is required')
  console.error('Usage: tsx scripts/delete-user-by-id.ts <userId>')
  process.exit(1)
}

async function deleteUserAccount(userId: string) {
  // Create admin client
  const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // 1. Get user details
    console.log(`Looking up user with ID: ${userId}`)
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (getUserError || !userData?.user) {
      throw new Error(`User not found: ${getUserError?.message || 'Unknown error'}`)
    }

    const user = userData.user
    console.log(`Found user: ${user.id} (${user.email})`)

    // 2. Get user's projects with member counts
    const { data: projectMemberships, error: membershipsError } = await supabaseAdmin
      .from('project_members')
      .select('project_id, left_at')
      .eq('user_id', user.id)
      .is('left_at', null)

    if (membershipsError) {
      throw new Error(`Failed to fetch project memberships: ${membershipsError.message}`)
    }

    // 3. Identify solo projects (only 1 active member)
    const projectIds = projectMemberships?.map(pm => pm.project_id) || []
    const soloProjectIds: string[] = []

    if (projectIds.length > 0) {
      // Get all members for each project
      const { data: allMembers, error: allMembersError } = await supabaseAdmin
        .from('project_members')
        .select('project_id, user_id, left_at')
        .in('project_id', projectIds)

      if (allMembersError) {
        throw new Error(`Failed to fetch all project members: ${allMembersError.message}`)
      }

      // Group by project and count active members
      const projectMemberCounts = new Map<string, number>()
      allMembers?.forEach(member => {
        if (!member.left_at) {
          const count = projectMemberCounts.get(member.project_id) || 0
          projectMemberCounts.set(member.project_id, count + 1)
        }
      })

      // Find projects with only 1 active member (solo projects)
      projectMemberCounts.forEach((count, projectId) => {
        if (count === 1) {
          soloProjectIds.push(projectId)
        }
      })
    }

    // 4. Delete solo projects (CASCADE will handle trees, nodes, etc.)
    if (soloProjectIds.length > 0) {
      console.log(`Deleting ${soloProjectIds.length} solo project(s)...`)
      const { error: deleteProjectsError } = await supabaseAdmin
        .from('projects')
        .delete()
        .in('id', soloProjectIds)

      if (deleteProjectsError) {
        throw new Error(`Failed to delete solo projects: ${deleteProjectsError.message}`)
      }
      console.log(`Deleted ${soloProjectIds.length} solo project(s)`)
    }

    // 5. Remove user from collaborative projects (soft delete with timestamp)
    const collaborativeProjectIds = projectIds.filter(id => !soloProjectIds.includes(id))
    if (collaborativeProjectIds.length > 0) {
      console.log(`Removing user from ${collaborativeProjectIds.length} collaborative project(s)...`)
      const { error: removeMembersError } = await supabaseAdmin
        .from('project_members')
        .update({ left_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .in('project_id', collaborativeProjectIds)

      if (removeMembersError) {
        console.warn(`Warning: Failed to remove from collaborative projects: ${removeMembersError.message}`)
        // Continue with user deletion even if this fails
      } else {
        console.log(`Removed user from ${collaborativeProjectIds.length} collaborative project(s)`)
      }
    }

    // 6. Delete user from auth.users (CASCADE handles everything else)
    console.log(`Deleting user from auth.users...`)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    
    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`)
    }

    console.log(`✅ Successfully deleted user account for ${user.email}`)
    console.log(`   - Deleted ${soloProjectIds.length} solo project(s)`)
    console.log(`   - Removed from ${collaborativeProjectIds.length} collaborative project(s)`)

  } catch (error) {
    console.error('Error deleting user account:', error)
    process.exit(1)
  }
}

deleteUserAccount(userId)


