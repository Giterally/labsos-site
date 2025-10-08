import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // Build the query for public researchers
    let query = supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        lab_name,
        institution,
        department,
        bio,
        skills,
        interests,
        orcid_id,
        website,
        linkedin,
        created_at
      `)
      .not('full_name', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Add search functionality
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,lab_name.ilike.%${search}%,institution.ilike.%${search}%,department.ilike.%${search}%,bio.ilike.%${search}%`)
    }

    const { data: profiles, error } = await query

    if (error) {
      throw new Error(`Failed to fetch researchers: ${error.message}`)
    }

    // Get project counts for each researcher
    const profileIds = profiles?.map(p => p.id) || []
    const { data: projectCounts, error: projectError } = await supabase
      .from('projects')
      .select('created_by')
      .in('created_by', profileIds)

    if (projectError) {
      console.warn('Failed to fetch project counts:', projectError)
    }

    // Count projects per researcher
    const projectCountMap = new Map<string, number>()
    projectCounts?.forEach(project => {
      const count = projectCountMap.get(project.created_by) || 0
      projectCountMap.set(project.created_by, count + 1)
    })

    // Get public project counts for each researcher
    const { data: publicProjectCounts, error: publicProjectError } = await supabase
      .from('projects')
      .select('created_by')
      .in('created_by', profileIds)
      .eq('visibility', 'public')

    if (publicProjectError) {
      console.warn('Failed to fetch public project counts:', publicProjectError)
    }

    // Count public projects per researcher
    const publicProjectCountMap = new Map<string, number>()
    publicProjectCounts?.forEach(project => {
      const count = publicProjectCountMap.get(project.created_by) || 0
      publicProjectCountMap.set(project.created_by, count + 1)
    })

    // Transform the data
    const transformedResearchers = (profiles || []).map(profile => {
      return {
        id: profile.id,
        full_name: profile.full_name || 'Unknown',
        email: profile.email,
        lab_name: profile.lab_name || 'Unknown Lab',
        institution: profile.institution || 'Unknown Institution',
        department: profile.department || 'Unknown Department',
        bio: profile.bio || 'No bio available',
        skills: profile.skills || [],
        interests: profile.interests || [],
        orcid_id: profile.orcid_id,
        website: profile.website,
        linkedin: profile.linkedin,
        created_at: profile.created_at,
        project_count: projectCountMap.get(profile.id) || 0,
        public_project_count: publicProjectCountMap.get(profile.id) || 0,
        // Generate avatar initials from full name or lab name
        avatar: (profile.full_name || profile.lab_name || 'U')
          .split(' ')
          .map((word: string) => word[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      }
    })

    return NextResponse.json({ 
      researchers: transformedResearchers,
      total: transformedResearchers.length,
      hasMore: transformedResearchers.length === limit
    })
  } catch (error: any) {
    console.error('Error fetching researchers:', error)
    return NextResponse.json(
      { message: 'Failed to fetch researchers', error: error.message },
      { status: 500 }
    )
  }
}
