import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  try {
    // Mock data for now - replace with Supabase queries
    const mockOutputs = [
      {
        id: "output-1",
        type: "publication",
        title: "Novel E. coli Expression Systems for Therapeutic Proteins",
        description: "Development of optimized expression systems for high-yield protein production",
        status: "published",
        date: "2023-12-15",
        url: "https://nature.com/articles/s41587-023-01234-5",
        doi: "10.1038/s41587-023-01234-5",
        journal: "Nature Biotechnology",
        impact_factor: 54.9,
        citations: 23,
        repository_url: null,
        license: null,
        file_size: null,
        format: null,
        project_id: projectId,
        created_by: "user-1",
        created_at: "2023-12-15T00:00:00Z",
        updated_at: "2023-12-15T00:00:00Z"
      },
      {
        id: "output-2",
        type: "software",
        title: "ProteinAnalyzer: A Comprehensive Tool for Protein Structure Analysis",
        description: "Open-source Python package for protein structure prediction and analysis",
        status: "published",
        date: "2023-11-20",
        url: null,
        doi: null,
        journal: null,
        impact_factor: null,
        citations: null,
        repository_url: "https://github.com/bioeng-lab/protein-analyzer",
        license: "MIT",
        file_size: null,
        format: "Python Package",
        project_id: projectId,
        created_by: "user-1",
        created_at: "2023-11-20T00:00:00Z",
        updated_at: "2023-11-20T00:00:00Z"
      }
    ]

    return NextResponse.json({ outputs: mockOutputs })
  } catch (error) {
    console.error('Error fetching outputs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch outputs' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  try {
    const body = await req.json()
    const {
      type,
      title,
      description,
      status = 'draft',
      date,
      url,
      doi,
      journal,
      impact_factor,
      citations,
      repository_url,
      license,
      file_size,
      format
    } = body

    // Validate required fields
    if (!type || !title || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, date' },
        { status: 400 }
      )
    }

    // Validate enum values
    const validTypes = ['publication', 'software', 'dataset', 'presentation', 'report', 'patent']
    const validStatuses = ['published', 'submitted', 'in_preparation', 'draft']

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be one of: ' + validTypes.join(', ') },
        { status: 400 }
      )
    }

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      )
    }

    // Validate date format
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      )
    }

    // Mock output creation - replace with Supabase insert
    const newOutput = {
      id: `output-${Date.now()}`,
      type,
      title,
      description: description || '',
      status,
      date,
      url: url || null,
      doi: doi || null,
      journal: journal || null,
      impact_factor: impact_factor ? parseFloat(impact_factor) : null,
      citations: citations ? parseInt(citations) : null,
      repository_url: repository_url || null,
      license: license || null,
      file_size: file_size ? parseInt(file_size) : null,
      format: format || null,
      project_id: projectId,
      created_by: 'user-1', // This should come from auth
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // In a real implementation, you would:
    // 1. Insert into Supabase outputs table
    // 2. Return the created output

    return NextResponse.json({ output: newOutput }, { status: 201 })
  } catch (error) {
    console.error('Error creating output:', error)
    return NextResponse.json(
      { error: 'Failed to create output' },
      { status: 500 }
    )
  }
}
