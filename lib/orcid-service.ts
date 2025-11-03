export interface ORCIDProfile {
  'orcid-identifier': {
    uri: string
    path: string
    host: string
  }
  person?: {
    name?: {
      'given-names'?: { value: string }
      'family-name'?: { value: string }
    }
    biography?: {
      content: string
    }
    'researcher-urls'?: {
      'researcher-url': Array<{
        'url-name': string
        url: { value: string }
      }>
    }
  }
}

export interface ORCIDWork {
  'put-code': number
  title: {
    title: { value: string }
  }
  type: string
  'publication-date'?: {
    year?: { value: string }
    month?: { value: string }
    day?: { value: string }
  }
  'journal-title'?: { value: string }
  'external-ids'?: {
    'external-id': Array<{
      'external-id-type': string
      'external-id-value': string
      'external-id-url'?: { value: string }
    }>
  }
}

export interface ORCIDEmployment {
  'put-code': number
  'department-name'?: string
  'role-title'?: string
  'start-date'?: {
    year?: { value: string }
    month?: { value: string }
    day?: { value: string }
  }
  'end-date'?: {
    year?: { value: string }
    month?: { value: string }
    day?: { value: string }
  }
  organization: {
    name: string | { value: string }  // ORCID API can return name as string or object
    address?: {
      city?: string
      region?: string
      country?: string
    }
  }
}

export interface ORCIDEmploymentResponse {
  'affiliation-group'?: Array<{
    'summaries': Array<{
      'employment-summary': ORCIDEmployment
    }>
  }>
  // Legacy support - some endpoints might return this directly
  'employment-summary'?: ORCIDEmployment[]
}

export interface ORCIDProfileChanges {
  bio?: string
  institution?: string
  department?: string
  website?: string
  linkedin?: string
  github?: string
}

export class ORCIDService {
  private baseUrl = 'https://pub.orcid.org/v3.0'

  async getProfile(orcidId: string): Promise<ORCIDProfile> {
    const response = await fetch(`${this.baseUrl}/${orcidId}/person`, {
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`ORCID API error: ${response.status}`)
    }
    return response.json()
  }

  async getWorks(orcidId: string): Promise<{ group: Array<{ 'work-summary': ORCIDWork[] }> }> {
    const response = await fetch(`${this.baseUrl}/${orcidId}/works`, {
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`ORCID API error: ${response.status}`)
    }
    return response.json()
  }

  async getEmployments(orcidId: string): Promise<ORCIDEmploymentResponse> {
    const response = await fetch(`${this.baseUrl}/${orcidId}/employments`, {
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) {
      // If employments endpoint fails, return empty array (not all ORCID profiles have employment data)
      if (response.status === 404) {
        return { 'employment-summary': [] }
      }
      throw new Error(`ORCID API error: ${response.status}`)
    }
    return response.json()
  }

  /**
   * Extract employment summaries from the ORCID API response
   * Handles both the new affiliation-group structure and legacy structure
   */
  extractEmploymentSummaries(response: ORCIDEmploymentResponse): ORCIDEmployment[] {
    // Check for new structure: affiliation-group > summaries > employment-summary
    if (response['affiliation-group'] && Array.isArray(response['affiliation-group'])) {
      const employments: ORCIDEmployment[] = []
      for (const group of response['affiliation-group']) {
        if (group.summaries && Array.isArray(group.summaries)) {
          for (const summary of group.summaries) {
            if (summary['employment-summary']) {
              employments.push(summary['employment-summary'])
            }
          }
        }
      }
      return employments
    }
    
    // Fall back to legacy structure
    if (response['employment-summary'] && Array.isArray(response['employment-summary'])) {
      return response['employment-summary']
    }
    
    return []
  }

  /**
   * Extract current employment (no end-date or most recent)
   */
  getCurrentEmployment(employments: ORCIDEmployment[]): ORCIDEmployment | null {
    if (!employments || employments.length === 0) return null

    // Find employments with no end date (current)
    const currentEmployments = employments.filter(emp => !emp['end-date'])
    
    if (currentEmployments.length > 0) {
      // If multiple current employments, return the most recent (by start date)
      return currentEmployments.sort((a, b) => {
        const aYear = parseInt(a['start-date']?.year?.value || '0')
        const bYear = parseInt(b['start-date']?.year?.value || '0')
        return bYear - aYear
      })[0]
    }

    // If no current employment, return most recent overall
    return employments.sort((a, b) => {
      const aYear = parseInt(a['start-date']?.year?.value || '0')
      const bYear = parseInt(b['start-date']?.year?.value || '0')
      return bYear - aYear
    })[0]
  }

  /**
   * Auto-detect URL types from researcher-urls array
   */
  detectURLs(researcherUrls?: Array<{ 'url-name': string; url: { value: string } }>): {
    website?: string
    linkedin?: string
    github?: string
  } {
    const urls: { website?: string; linkedin?: string; github?: string } = {}
    
    if (!researcherUrls || researcherUrls.length === 0) return urls

    for (const urlEntry of researcherUrls) {
      const url = urlEntry.url.value.toLowerCase()
      
      if (url.includes('linkedin.com')) {
        if (!urls.linkedin) {
          urls.linkedin = urlEntry.url.value
        }
      } else if (url.includes('github.com')) {
        if (!urls.github) {
          urls.github = urlEntry.url.value
        }
      } else {
        // First generic URL becomes website
        if (!urls.website) {
          urls.website = urlEntry.url.value
        }
      }
    }

    return urls
  }

  /**
   * Extract profile data changes from ORCID profile and employment data
   */
  extractProfileChanges(
    profile: ORCIDProfile,
    employment: ORCIDEmployment | null,
    currentProfile?: {
      bio?: string | null
      institution?: string | null
      department?: string | null
      website?: string | null
      linkedin?: string | null
      github?: string | null
    }
  ): ORCIDProfileChanges {
    const changes: ORCIDProfileChanges = {}

    // Extract bio (merge if existing)
    if (profile.person?.biography?.content) {
      const orcidBio = profile.person.biography.content.trim()
      if (currentProfile?.bio) {
        // Merge: existing bio + ORCID bio
        changes.bio = `${currentProfile.bio}\n\n[From ORCID] ${orcidBio}`
      } else {
        changes.bio = orcidBio
      }
    }

    // Extract institution and department from current employment
    if (employment) {
      // Handle different possible organization name structures
      // ORCID API v3 can return name as string or as object with value property
      let orgName: string | undefined
      if (employment.organization?.name) {
        if (typeof employment.organization.name === 'string') {
          orgName = employment.organization.name
        } else if (employment.organization.name.value) {
          orgName = employment.organization.name.value
        }
      }

      if (orgName && orgName.trim() && orgName !== currentProfile?.institution) {
        changes.institution = orgName.trim()
      }

      // Extract department name
      const deptName = employment['department-name']
      if (deptName && typeof deptName === 'string' && deptName.trim() && deptName !== currentProfile?.department) {
        changes.department = deptName.trim()
      }

      // If no department-name but we have role-title, we could potentially extract department from it
      // For example: "Associate Professor (Geology and Environmental Geoscience)" 
      // But this is less reliable, so we'll skip it for now
    }

    // Extract URLs with auto-detection
    const detectedUrls = this.detectURLs(profile.person?.['researcher-urls']?.['researcher-url'])
    
    if (detectedUrls.website && detectedUrls.website !== currentProfile?.website) {
      changes.website = detectedUrls.website
    }
    if (detectedUrls.linkedin && detectedUrls.linkedin !== currentProfile?.linkedin) {
      changes.linkedin = detectedUrls.linkedin
    }
    if (detectedUrls.github && detectedUrls.github !== currentProfile?.github) {
      changes.github = detectedUrls.github
    }

    return changes
  }

  validateORCIDId(orcidId: string): boolean {
    // ORCID format: 0000-0002-1825-0097
    const pattern = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/
    return pattern.test(orcidId)
  }

  /**
   * Extract DOI from ORCID work external IDs
   */
  extractDOI(work: ORCIDWork): string | null {
    const externalIds = work['external-ids']?.['external-id']
    if (!externalIds) return null
    
    const doiEntry = externalIds.find(id => id['external-id-type'] === 'doi')
    return doiEntry?.['external-id-value'] || null
  }

  /**
   * Extract authors from ORCID work (limited in summary view)
   * Note: ORCID works API summary doesn't include full author details
   */
  extractAuthors(work: ORCIDWork): string[] {
    // ORCID works summary doesn't include authors
    // This would require fetching individual work details
    return []
  }

  /**
   * Map ORCID work type to our publication type
   */
  mapWorkType(orcidType: string): string {
    const typeMap: Record<string, string> = {
      'JOURNAL_ARTICLE': 'journal-article',
      'BOOK': 'book',
      'BOOK_CHAPTER': 'book-chapter',
      'CONFERENCE_PAPER': 'conference-paper',
      'CONFERENCE_POSTER': 'conference-poster',
      'CONFERENCE_ABSTRACT': 'conference-abstract',
      'DISSERTATION': 'dissertation',
      'THESIS': 'thesis',
      'PATENT': 'patent',
      'SOFTWARE': 'software',
      'DATASET': 'dataset',
      'PREPRINT': 'preprint',
      'REPORT': 'report',
      'OTHER': 'other'
    }
    return typeMap[orcidType] || 'other'
  }
}
