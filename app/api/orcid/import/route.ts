import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ORCIDService } from '@/lib/orcid-service'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'

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

    // Authenticate request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Verify profile exists and belongs to authenticated user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify ownership - user can only import to their own profile
    // Note: profiles.id is the foreign key to auth.users.id, so they're the same value
    if (profile.id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to import to this profile' }, { status: 403 })
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

  // Track publications in current import session to detect duplicates with different date precision
  const importSessionTracker = new Map<string, {
    work: any,
    dateSpecificity: number // 1=year, 2=year+month, 3=year+month+day
  }>()

  for (const group of worksData.group || []) {
    for (const work of group['work-summary'] || []) {
      const doi = orcidService.extractDOI(work)
      const title = work.title?.title?.value
      const putCode = work['put-code']?.toString()
      const publicationDate = work['publication-date']
      
      // Skip if already exists in database
      if (
        (doi && existingDOIs.has(doi.toLowerCase())) ||
        (title && existingTitles.has(title.toLowerCase())) ||
        (putCode && existingPutCodes.has(putCode))
      ) {
        continue
      }

      // Calculate date specificity for this work
      const hasYear = !!publicationDate?.year?.value
      const hasMonth = !!publicationDate?.month?.value
      const hasDay = !!publicationDate?.day?.value
      const dateSpecificity = hasYear ? (hasDay ? 3 : (hasMonth ? 2 : 1)) : 0

      // Create unique key for this publication (DOI takes precedence, fallback to title)
      const uniqueKey = doi ? doi.toLowerCase() : (title ? title.toLowerCase() : null)
      
      if (uniqueKey) {
        // Check if we've already seen this publication in current import
        const existing = importSessionTracker.get(uniqueKey)
        
        if (existing) {
          // Duplicate found in current import session
          if (dateSpecificity > existing.dateSpecificity) {
            // This version is more specific, replace the previous one
            importSessionTracker.set(uniqueKey, { work, dateSpecificity })
          }
          // Otherwise skip this less specific version
          continue
        } else {
          // First time seeing this publication
          importSessionTracker.set(uniqueKey, { work, dateSpecificity })
        }
      }
    }
  }

  // Now import the deduplicated publications
  for (const { work } of importSessionTracker.values()) {
    const doi = orcidService.extractDOI(work)
    const title = work.title?.title?.value
    const putCode = work['put-code']?.toString()
    const journalTitle = work['journal-title']?.value
    const publicationDate = work['publication-date']
    
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
        authors: null, // ORCID summary doesn't include authors - can be filled manually later
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

  return importedCount
}
