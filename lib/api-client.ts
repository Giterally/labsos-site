import { supabase } from '@/lib/supabase-client'
// DEBUG: module load marker
console.debug('[api-client] module loaded')

export interface AuthFetchOptions extends RequestInit {
  requireAuth?: boolean
}

/**
 * Auth-aware fetch: adds Authorization header when a Supabase session exists.
 * If a protected request returns 401/403, it throws a special error so callers
 * can handle re-auth (or we can redirect here for global UX).
 */
export async function authFetch(input: RequestInfo | URL, init: AuthFetchOptions = {}) {
  // DEBUG: entry
  try { console.debug('[authFetch] called', { url: String(input), requireAuth: !!init.requireAuth }) } catch {}
  const { requireAuth, headers, ...rest } = init

  const mergedHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      mergedHeaders['Authorization'] = `Bearer ${session.access_token}`
    } else if (requireAuth) {
      // No token for an auth-required request
      const err = new Error('No authentication token available')
      ;(err as any).code = 'NO_AUTH'
      throw err
    }
  } catch (e) {
    if (requireAuth) throw e
  }

  const response = await fetch(input, { ...rest, headers: mergedHeaders })

  if (response.status === 401 || response.status === 403) {
    const err = new Error('Authentication required')
    ;(err as any).code = 'AUTH_REQUIRED'
    ;(err as any).status = response.status
    throw err
  }

  // DEBUG: exit
  try { console.debug('[authFetch] response', { url: String(input), status: response.status }) } catch {}
  return response
}


