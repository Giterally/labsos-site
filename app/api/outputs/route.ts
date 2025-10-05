import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    const { data: output, error } = await supabase
      .from('outputs')
      .insert([{
        ...body,
        created_by: user.id
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create output: ${error.message}`)
    }

    return NextResponse.json({ output }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating output:', error)
    return NextResponse.json(
      { message: 'Failed to create output', error: error.message },
      { status: 500 }
    )
  }
}
