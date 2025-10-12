import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { name, email, message } = body

    // Validate required fields
    if (!name || !email || !message) {
      console.log('Missing required fields:', { name: !!name, email: !!email, message: !!message })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get current user if authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error:', authError)
    }

    // Insert contact form submission into database
    const { data, error } = await supabase
      .from('contact')
      .insert({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        user_id: user?.id || null
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to submit contact form' },
        { status: 500 }
      )
    }

    console.log('Contact form submitted successfully:', data)
    return NextResponse.json(
      { message: 'Contact form submitted successfully', id: data.id },
      { status: 200 }
    )

  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
