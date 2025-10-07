import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client with anon key for server-side operations
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ researcherId: string }> }
) {
  try {
    const { researcherId } = await params

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
    const { data: currentProjects, error: currentProjectsError } = await supabase
      .from('project_members')
      .select(`
        id,
        role,
        joined_at,
        projects!project_members_project_id_fkey (
          id,
          name,
          description,
          created_at
        )
      `)
      .eq('user_id', researcherId)
      .is('left_at', null)

    // Get the user's past projects (where they have left_at set)
    const { data: pastProjects, error: pastProjectsError } = await supabase
      .from('project_members')
      .select(`
        id,
        role,
        joined_at,
        left_at,
        projects!project_members_project_id_fkey (
          id,
          name,
          description,
          created_at
        )
      `)
      .eq('user_id', researcherId)
      .not('left_at', 'is', null)

    // Transform the data to match the expected format
    const researcher = {
      id: profile.id,
      name: profile.full_name || 'Unknown User',
      title: 'Researcher', // Default title since we don't have this field yet
      email: profile.email,
      bio: profile.bio || 'No bio available',
      avatar: profile.full_name ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U',
      institution: profile.institution || profile.lab_name || 'Unknown Institution',
      department: profile.department || 'Unknown Department',
      location: profile.location || 'Unknown Location',
      website: profile.website || null,
      linkedin: profile.linkedin || null,
      orcid: profile.orcid || null,
      joinedDate: profile.created_at ? new Date(profile.created_at).toISOString().split('T')[0] : 'Unknown',
      lastActive: profile.updated_at ? new Date(profile.updated_at).toISOString().split('T')[0] : 'Unknown',
      currentProjects: (currentProjects || []).map(member => {
        const project = Array.isArray(member.projects) ? member.projects[0] : member.projects
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
      }),
      pastProjects: (pastProjects || []).map(member => {
        const project = Array.isArray(member.projects) ? member.projects[0] : member.projects
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
      }),
      publications: [], // TODO: Implement publications table
      skills: profile.skills || [],
      interests: profile.interests || [],
      stats: {
        totalProjects: (currentProjects?.length || 0) + (pastProjects?.length || 0),
        activeProjects: currentProjects?.length || 0,
        completedProjects: pastProjects?.length || 0,
        publications: 0, // TODO: Implement publications count
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
