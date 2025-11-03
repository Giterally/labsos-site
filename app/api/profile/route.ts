import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      user_id, 
      full_name, 
      bio, 
      institution, 
      department, 
      location, 
      website, 
      linkedin, 
      github, 
      orcid, 
      skills, 
      interests 
    } = body

    if (!user_id) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }

    // Update the profile in the database
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: full_name || null,
        bio: bio || null,
        institution: institution || null,
        department: department || null,
        location: location || null,
        website: website || null,
        linkedin: linkedin || null,
        github: github || null,
        orcid_id: orcid || null,
        skills: skills || [],
        interests: interests || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', user_id)
      .select()

    if (error) {
      console.error('Error updating profile:', error)
      return NextResponse.json(
        { message: 'Failed to update profile', error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: 'Profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      message: 'Profile updated successfully',
      profile: data[0] 
    })

  } catch (error: any) {
    console.error('Error in profile update API:', error)
    return NextResponse.json(
      { message: 'Internal server error', error: error.message },
      { status: 500 }
    )
  }
}
