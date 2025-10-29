import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ researcherId: string }> }
) {
  try {
    const { researcherId } = await params

    // Create Supabase client - use service role for public profile queries
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = supabaseServiceKey 
      ? createClient(supabaseUrl, supabaseServiceKey)
      : createClient(supabaseUrl, supabaseAnonKey)

    // Get the user's profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', researcherId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { message: 'Researcher not found' },
        { status: 404 }
      )
    }

    // Get the user's current projects (where they are active team members)
    const { data: currentProjectMembers, error: currentProjectsError } = await supabase
      .from('project_members')
      .select('id, role, joined_at, project_id')
      .eq('user_id', researcherId)
      .is('left_at', null)


    // Get project details for current projects
    let currentProjects = []
    if (currentProjectMembers && currentProjectMembers.length > 0) {
      const projectIds = currentProjectMembers.map(member => member.project_id)
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, description, created_at')
        .in('id', projectIds)

      currentProjects = currentProjectMembers.map(member => {
        const project = projects?.find(p => p.id === member.project_id)
        return {
          id: member.id,
          name: project?.name || 'Unknown Project',
          description: project?.description || 'No description available',
          status: 'active',
          role: member.role,
          startDate: member.joined_at ? new Date(member.joined_at).toISOString().split('T')[0] : 'Unknown',
          project: {
            id: project?.id,
            name: project?.name || 'Unknown Project'
          }
        }
      })
    }

    // Get the user's past projects (where they have left_at set)
    const { data: pastProjectMembers, error: pastProjectsError } = await supabase
      .from('project_members')
      .select('id, role, joined_at, left_at, project_id')
      .eq('user_id', researcherId)
      .not('left_at', 'is', null)

    // Get project details for past projects
    let pastProjects = []
    if (pastProjectMembers && pastProjectMembers.length > 0) {
      const projectIds = pastProjectMembers.map(member => member.project_id)
      const { data: pastProjectDetails, error: pastProjectsDetailsError } = await supabase
        .from('projects')
        .select('id, name, description, created_at')
        .in('id', projectIds)

      pastProjects = pastProjectMembers.map(member => {
        const project = pastProjectDetails?.find(p => p.id === member.project_id)
        return {
          id: member.id,
          name: project?.name || 'Unknown Project',
          description: project?.description || 'No description available',
          status: 'completed',
          role: member.role,
          startDate: member.joined_at ? new Date(member.joined_at).toISOString().split('T')[0] : 'Unknown',
          endDate: member.left_at ? new Date(member.left_at).toISOString().split('T')[0] : 'Unknown',
          project: {
            id: project?.id,
            name: project?.name || 'Unknown Project'
          }
        }
      })
    }

    // Get publications
    const { data: publications, error: pubError } = await supabase
      .from('publications')
      .select('*')
      .eq('profile_id', researcherId)
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })

    // Transform the data to match the expected format
    const researcher = {
      id: profile.id,
      name: profile.full_name || 'Unknown User',
      title: 'Researcher', // Default title since we don't have this field yet
      email: profile.email,
      bio: profile.bio || 'No bio available',
      avatar: profile.full_name ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U',
      institution: profile.institution && profile.institution !== 'Not specified' ? profile.institution : (profile.lab_name || 'Not specified'),
      department: profile.department && profile.department !== 'Not specified' ? profile.department : 'Not specified',
      location: profile.location || 'Unknown Location',
      website: profile.website || null,
      linkedin: profile.linkedin || null,
      github: profile.github || null,
      orcid: profile.orcid || null,
      joinedDate: profile.created_at ? new Date(profile.created_at).toISOString().split('T')[0] : 'Unknown',
      lastActive: profile.updated_at ? new Date(profile.updated_at).toISOString().split('T')[0] : 'Unknown',
      currentProjects: currentProjects || [],
      pastProjects: pastProjects || [],
      publications: (publications || []).map(pub => ({
        id: pub.id,
        profile_id: pub.profile_id,
        user_id: pub.user_id,
        title: pub.title,
        authors: pub.authors || null,
        journal_title: pub.journal_title || null,
        year: pub.year || null,
        month: pub.month || null,
        day: pub.day || null,
        abstract: pub.abstract || null,
        doi: pub.doi || null,
        url: pub.url || null,
        type: pub.type || 'other',
        source: pub.source || 'manual',
        publication_date: pub.publication_date || null,
        external_ids: pub.external_ids || [],
        orcid_put_code: pub.orcid_put_code || null,
        created_at: pub.created_at,
        updated_at: pub.updated_at
      })),
      skills: profile.skills || [],
      interests: profile.interests || [],
      stats: {
        totalProjects: (currentProjects?.length || 0) + (pastProjects?.length || 0),
        activeProjects: currentProjects?.length || 0,
        completedProjects: pastProjects?.length || 0,
        publications: publications?.length || 0,
        collaborations: (currentProjects?.length || 0) + (pastProjects?.length || 0)
      }
    }

    return NextResponse.json({ researcher })
  } catch (error: any) {
    console.error('Error fetching researcher profile:', error)
    return NextResponse.json(
      { message: 'Failed to fetch researcher profile', error: error.message },
      { status: 500 }
    )
  }
}
