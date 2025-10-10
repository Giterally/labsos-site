import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params
    const body = await request.json()
    const { 
      name, 
      type, 
      description, 
      format, 
      file_size, 
      size_unit, 
      access_level, 
      repository_url 
    } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Validate access_level
    const validAccessLevels = ['public', 'restricted', 'private']
    const finalAccessLevel = validAccessLevels.includes(access_level) ? access_level : 'public'
    
    // Validate size_unit
    const validSizeUnits = ['B', 'KB', 'MB', 'GB', 'TB']
    const finalSizeUnit = validSizeUnits.includes(size_unit) ? size_unit : 'bytes'
    
    // Validate dataset type
    const validDatasetTypes = ['raw_data', 'processed_data', 'training_data', 'validation_data']
    const finalDatasetType = validDatasetTypes.includes(type) ? type : 'raw_data'

    // Update the dataset entry
    const { data, error: datasetError } = await supabase
      .from('datasets')
      .update({
        name: name.trim(),
        type: finalDatasetType,
        description: description?.trim() || null,
        format: format?.trim() || null,
        file_size: file_size || null,
        size_unit: finalSizeUnit,
        access_level: finalAccessLevel,
        repository_url: repository_url?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', datasetId)
      .select()
      .single()

    if (datasetError) {
      console.error('Error updating dataset:', datasetError)
      return NextResponse.json({ 
        error: 'Failed to update dataset',
        details: datasetError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ dataset: data })
  } catch (error) {
    console.error('Error in PUT /api/datasets/[datasetId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the dataset entry (this will cascade delete project_datasets links)
    const { error: datasetError } = await supabase
      .from('datasets')
      .delete()
      .eq('id', datasetId)

    if (datasetError) {
      console.error('Error deleting dataset:', datasetError)
      return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/datasets/[datasetId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
