// Publication types
export interface Publication {
  id: string
  profile_id: string
  user_id: string // For compatibility with existing schema
  title: string
  type: string
  journal_title: string | null
  publication_date: {
    year?: string | null
    month?: string | null
    day?: string | null
  } | null
  abstract: string | null
  doi: string | null
  url: string | null
  external_ids: Array<{
    type: string
    value: string
  }>
  authors: string[] | null
  orcid_put_code: string | null
  source: 'manual' | 'orcid'
  year: number | null
  month: number | null
  day: number | null
  created_at: string
  updated_at: string
}

// ORCID API types
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

export interface ORCIDWorksResponse {
  group: Array<{
    'work-summary': ORCIDWork[]
  }>
}

// API Response types
export interface ORCIDProfileChanges {
  bio?: string
  institution?: string
  department?: string
  website?: string
  linkedin?: string
  github?: string
}

export interface ORCIDImportResponse {
  success: boolean
  importedPublications: number
  profileChanges: ORCIDProfileChanges
}

export interface ORCIDImportError {
  error: string
}
