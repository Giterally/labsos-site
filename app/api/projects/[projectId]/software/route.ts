import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  try {
    // Mock data for now - replace with Supabase queries
    const mockSoftware = [
      {
        id: "software-1",
        name: "ProteinAnalyzer",
        type: "internal",
        category: "analysis",
        description: "Custom Python package for protein structure analysis and prediction",
        version: "2.1.0",
        license_type: "free",
        license_cost: null,
        license_period: null,
        repository_url: "https://github.com/bioeng-lab/protein-analyzer",
        documentation_url: "https://protein-analyzer.readthedocs.io",
        project_id: projectId,
        created_by: "user-1",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z"
      },
      {
        id: "software-2",
        name: "MATLAB",
        type: "external",
        category: "data_processing",
        description: "Numerical computing environment for data analysis and visualization",
        version: "R2023b",
        license_type: "paid",
        license_cost: 2150.00,
        license_period: "yearly",
        repository_url: null,
        documentation_url: "https://mathworks.com/help/matlab",
        project_id: projectId,
        created_by: "user-1",
        created_at: "2024-01-05T12:00:00Z",
        updated_at: "2024-01-05T12:00:00Z"
      }
    ]

    return NextResponse.json({ software: mockSoftware })
  } catch (error) {
    console.error('Error fetching software:', error)
    return NextResponse.json(
      { error: 'Failed to fetch software' },
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
    if (!name || !type || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, category' },
        { status: 400 }
      )
    }

    // Validate enum values
    const validTypes = ['internal', 'external']
    const validCategories = ['analysis', 'visualization', 'data_processing', 'simulation', 'other']
    const validLicenseTypes = ['free', 'paid', 'academic', 'commercial']
    const validLicensePeriods = ['monthly', 'yearly', 'one_time']

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be one of: ' + validTypes.join(', ') },
        { status: 400 }
      )
    }

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be one of: ' + validCategories.join(', ') },
        { status: 400 }
      )
    }

    if (license_type && !validLicenseTypes.includes(license_type)) {
      return NextResponse.json(
        { error: 'Invalid license_type. Must be one of: ' + validLicenseTypes.join(', ') },
        { status: 400 }
      )
    }

    if (license_period && !validLicensePeriods.includes(license_period)) {
      return NextResponse.json(
        { error: 'Invalid license_period. Must be one of: ' + validLicensePeriods.join(', ') },
        { status: 400 }
      )
    }

    // Mock software creation - replace with Supabase insert
    const newSoftware = {
      id: `software-${Date.now()}`,
      name,
      type,
      category,
      description: description || '',
      version: version || null,
      license_type: license_type || null,
      license_cost: license_cost ? parseFloat(license_cost) : null,
      license_period: license_period || null,
      repository_url: repository_url || null,
      documentation_url: documentation_url || null,
      project_id: projectId,
      created_by: 'user-1', // This should come from auth
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // In a real implementation, you would:
    // 1. Insert into Supabase software table
    // 2. Return the created software

    return NextResponse.json({ software: newSoftware }, { status: 201 })
  } catch (error) {
    console.error('Error creating software:', error)
    return NextResponse.json(
      { error: 'Failed to create software' },
      { status: 500 }
    )
  }
}
