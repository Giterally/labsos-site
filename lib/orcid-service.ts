export interface ORCIDProfile {
  'orcid-identifier': {
    uri: string
    path: string
    host: string
  }
  person: {
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
