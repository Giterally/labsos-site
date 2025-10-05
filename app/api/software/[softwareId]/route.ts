import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function PUT(
  request: NextRequest,
  { params }: { params: { softwareId: string } }
) {
  try {
    const { softwareId } = params
    const body = await request.json()
    const { 
      name, 
      type, 
      category, 
      description, 
      version, 
      license_type, 
      license_cost, 
      license_period, 
      repository_url, 
      documentation_url 
    } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Update the software entry
    const { data, error: softwareError } = await supabase
      .from('software')
      .update({
        name: name.trim(),
        type: type || 'external',
        category: category || 'other',
        description: description?.trim() || null,
        version: version?.trim() || null,
        license_type: license_type || 'free',
        license_cost: license_cost || null,
        license_period: license_period || 'one_time',
        repository_url: repository_url?.trim() || null,
        documentation_url: documentation_url?.trim() || null,
        last_updated: new Date().toISOString()
      })
      .eq('id', softwareId)
      .select()
      .single()

    if (softwareError) {
      console.error('Error updating software:', softwareError)
      return NextResponse.json({ 
        error: 'Failed to update software',
        details: softwareError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ software: data })
  } catch (error) {
    console.error('Error in PUT /api/software/[softwareId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { softwareId: string } }
) {
  try {
    const { softwareId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the software entry (this will cascade delete project_software links)
    const { error: softwareError } = await supabase
      .from('software')
      .delete()
      .eq('id', softwareId)

    if (softwareError) {
      console.error('Error deleting software:', softwareError)
      return NextResponse.json({ error: 'Failed to delete software' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/software/[softwareId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
