import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ORCIDService } from '@/lib/orcid-service'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { orcidId, profileId } = await request.json()
    
    if (!orcidId || !profileId) {
      return NextResponse.json({ error: 'ORCID ID and profile ID are required' }, { status: 400 })
    }
    
    // Validate ORCID ID format
    const orcidService = new ORCIDService()
    if (!orcidService.validateORCIDId(orcidId)) {
      return NextResponse.json({ error: 'Invalid ORCID ID format' }, { status: 400 })
    }

    // Initialize Supabase
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Verify profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch data from ORCID API
    const [profileData, worksData] = await Promise.all([
      orcidService.getProfile(orcidId),
      orcidService.getWorks(orcidId)
    ])

    // Update profile with ORCID data
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        orcid_id: orcidId,
        orcid_data: profileData,
        orcid_last_sync: new Date().toISOString()
      })
      .eq('id', profileId)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    // Process and import publications
    const importedCount = await importPublications(supabase, profileId, worksData, orcidService)

    return NextResponse.json({
      success: true,
      importedPublications: importedCount,
      profile: profileData
    })
  } catch (error: any) {
    console.error('ORCID import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import ORCID data' },
      { status: 500 }
    )
  }
}

async function importPublications(
  supabase: any, 
  profileId: string, 
  worksData: any, 
  orcidService: ORCIDService
): Promise<number> {
  let importedCount = 0
  
  // Get existing publications to check for duplicates
  const { data: existingPubs } = await supabase
    .from('publications')
    .select('doi, title, orcid_put_code')
    .eq('profile_id', profileId)

  const existingDOIs = new Set(existingPubs?.map(p => p.doi?.toLowerCase()).filter(Boolean))
  const existingTitles = new Set(existingPubs?.map(p => p.title?.toLowerCase()).filter(Boolean))
  const existingPutCodes = new Set(existingPubs?.map(p => p.orcid_put_code).filter(Boolean))

  for (const group of worksData.group || []) {
    for (const work of group['work-summary'] || []) {
      // Extract data from ORCID work
      const doi = orcidService.extractDOI(work)
      const title = work.title?.title?.value
      const putCode = work['put-code']?.toString()
      const journalTitle = work['journal-title']?.value
      const publicationDate = work['publication-date']
      
      // Skip if duplicate (by DOI, title, or put-code)
      if (
        (doi && existingDOIs.has(doi.toLowerCase())) ||
        (title && existingTitles.has(title.toLowerCase())) ||
        (putCode && existingPutCodes.has(putCode))
      ) {
        continue
      }

      // Extract publication date components
      const year = publicationDate?.year?.value ? parseInt(publicationDate.year.value) : null
      const month = publicationDate?.month?.value ? parseInt(publicationDate.month.value) : null
      const day = publicationDate?.day?.value ? parseInt(publicationDate.day.value) : null

      // Create publication date JSONB
      const publicationDateJson = publicationDate ? {
        year: publicationDate.year?.value || null,
        month: publicationDate.month?.value || null,
        day: publicationDate.day?.value || null
      } : null

      // Extract external IDs
      const externalIds = work['external-ids']?.['external-id'] || []

      // Insert publication
      const { error } = await supabase
        .from('publications')
        .insert({
          profile_id: profileId,
          user_id: profileId, // Keep for compatibility
          title: title || 'Untitled',
          type: orcidService.mapWorkType(work.type || 'OTHER'),
          journal_title: journalTitle || null,
          publication_date: publicationDateJson,
          doi: doi || null,
          url: doi ? `https://doi.org/${doi}` : null,
          external_ids: externalIds,
          authors: [], // ORCID summary doesn't include authors
          orcid_put_code: putCode,
          source: 'orcid',
          year,
          month,
          day
        })

      if (!error) {
        importedCount++
      } else {
        console.error('Error inserting publication:', error)
      }
    }
  }

  return importedCount
}
