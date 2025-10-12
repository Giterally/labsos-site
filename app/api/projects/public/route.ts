import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkProjectPermission } from '@/lib/permission-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client with anon key for server-side operations
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    
    // Filter parameters
    const minMembers = parseInt(searchParams.get('minMembers') || '0')
    const maxMembers = parseInt(searchParams.get('maxMembers') || '999')
    const status = searchParams.get('status') || ''
    const visibility = searchParams.get('visibility') || ''
    const institution = searchParams.get('institution') || ''
    const department = searchParams.get('department') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      // Extract the token
      const token = authHeader.replace('Bearer ', '')
      
      // Verify the token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Build the query for discoverable projects
    // Show ALL projects regardless of visibility or user authentication
    let query = supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        institution,
        department,
        status,
        visibility,
        created_at,
        created_by,
        profiles!projects_created_by_fkey (
          full_name,
          email,
          lab_name
        )
      `)
      .order('created_at', { ascending: false })

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    // Add search functionality
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,institution.ilike.%${search}%,department.ilike.%${search}%`)
    }

    const { data: projects, error } = await query

    if (error) {
      throw new Error(`Failed to fetch public projects: ${error.message}`)
    }

    // Get member counts for each project
    const projectIds = projects?.map(p => p.id) || []
    const { data: memberCounts, error: memberError } = await supabase
      .from('project_members')
      .select('project_id')
      .in('project_id', projectIds)
      .is('left_at', null)

    if (memberError) {
      console.warn('Failed to fetch member counts:', memberError)
    }

    // Count members per project
    const memberCountMap = new Map<string, number>()
    memberCounts?.forEach(member => {
      const count = memberCountMap.get(member.project_id) || 0
      memberCountMap.set(member.project_id, count + 1)
    })

    // Get experiment tree counts for each project
    const { data: treeCounts, error: treeError } = await supabase
      .from('experiment_trees')
      .select('project_id')
      .in('project_id', projectIds)

    if (treeError) {
      console.warn('Failed to fetch tree counts:', treeError)
    }

    // Count trees per project
    const treeCountMap = new Map<string, number>()
    treeCounts?.forEach(tree => {
      const count = treeCountMap.get(tree.project_id) || 0
      treeCountMap.set(tree.project_id, count + 1)
    })

    // Get user's project memberships for access control
    let userMemberships = new Set<string>()
    if (userId) {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId)
        .is('left_at', null)
      
      if (memberships) {
        userMemberships = new Set(memberships.map(m => m.project_id))
      }
    }

    // Transform the data - include ALL projects with canAccess field
    const transformedProjects = (projects || []).map(project => {
      // Determine if user can access this project
      const canAccess = project.visibility === 'public' || 
                       (project.visibility === 'private' && 
                        (project.created_by === userId || userMemberships.has(project.id)))
      const profile = Array.isArray(project.profiles) ? project.profiles[0] : project.profiles
      return {
        id: project.id,
        name: project.name,
        description: project.description || 'No description available',
        institution: project.institution || 'Unknown Institution',
        department: project.department || 'Unknown Department',
        status: project.status,
        visibility: project.visibility,
        created_at: project.created_at,
        lead_researcher: profile?.full_name || 'Unknown',
        lab_name: profile?.lab_name || profile?.full_name || 'Unknown Lab',
        member_count: memberCountMap.get(project.id) || 0,
        tree_count: treeCountMap.get(project.id) || 0,
        canAccess: canAccess,
        // Generate avatar initials from lab name or project name
        avatar: (profile?.lab_name || project.name)
          .split(' ')
          .map((word: string) => word[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      }
    })

    // Apply filters
    const filteredProjects = transformedProjects.filter(project => {
      // Team size filter
      if (project.member_count < minMembers || project.member_count > maxMembers) return false
      
      // Status filter
      if (status && project.status !== status) return false
      
      // Visibility filter
      if (visibility && project.visibility !== visibility) return false
      
      // Institution filter
      if (institution && !project.institution.toLowerCase().includes(institution.toLowerCase())) return false
      
      // Department filter
      if (department && !project.department.toLowerCase().includes(department.toLowerCase())) return false
      
      // Date range filter
      if (dateFrom && new Date(project.created_at) < new Date(dateFrom)) return false
      if (dateTo && new Date(project.created_at) > new Date(dateTo)) return false
      
      return true
    })

    return NextResponse.json({ 
      projects: filteredProjects,
      total: filteredProjects.length,
      hasMore: filteredProjects.length === limit
    })
  } catch (error: any) {
    console.error('Error fetching public projects:', error)
    return NextResponse.json(
      { message: 'Failed to fetch public projects', error: error.message },
      { status: 500 }
    )
  }
}
