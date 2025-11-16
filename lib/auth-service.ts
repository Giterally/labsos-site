import { supabase } from './supabase-client'

export interface User {
  id: string
  email: string
  full_name: string | null
  lab_name: string | null
  avatar_url: string | null
  institution?: string
  department?: string
  profile_picture_url?: string
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

// Check if email already exists in auth.users
export async function checkEmailExists(email: string): Promise<{
  exists: boolean
  isVerified: boolean | null
  confirmationSentAt: string | null
}> {
  try {
    const { data, error } = await supabase.rpc('check_email_status', {
      email_to_check: email.toLowerCase()
    })
    
    if (error) {
      console.log('Error checking email:', error)
      return { exists: false, isVerified: null, confirmationSentAt: null }
    }
    
    return data || { exists: false, isVerified: null, confirmationSentAt: null }
  } catch (error) {
    console.log('Error checking email:', error)
    return { exists: false, isVerified: null, confirmationSentAt: null }
  }
}

// Sign up with email and password
export async function signUp(email: string, password: string, fullName?: string, institution?: string, department?: string) {
  // Check if email already exists
  const emailStatus = await checkEmailExists(email)
  
  if (emailStatus.exists) {
    if (emailStatus.isVerified) {
      // Confirmed account exists
      return { 
        error: { 
          message: "An account with this email already exists and is verified. Please sign in instead." 
        } 
      }
    } else {
      // Unverified account exists
      return { 
        error: { 
          message: "A verification email has already been sent to this address. Please check your inbox and spam folder (verification links expire after 24 hours)." 
        } 
      }
    }
  }

  // Proceed with signup if email doesn't exist
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: fullName,
        institution: institution,
        department: department
      },
      emailRedirectTo: 'https://olvaro.net/login?verified=true'
    }
  })

  if (error) {
    console.log('Signup error:', error)
    return { error }
  }

  console.log('Signup successful:', data)
  return { data }
}

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { error }
  }

  return { data }
}

// Reset password for email
export async function resetPasswordForEmail(email: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://olvaro.net'
  const redirectTo = `${siteUrl}/reset-password`
  
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  })

  if (error) {
    return { error }
  }

  return { data }
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    throw error
  }
}

// Get current user
export async function getCurrentUser(forceRefresh = false): Promise<User | null> {
  try {
    // Add timeout protection for getUser()
    const getUserPromise = supabase.auth.getUser()
    const getUserTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 5000)
    )
    
    const { data: { user }, error } = await Promise.race([
      getUserPromise,
      getUserTimeoutPromise
    ])
    
    if (error || !user) {
      return null
    }

    // Get profile data from profiles table with timeout protection
    const profilePromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    const profileTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PROFILE_TIMEOUT')), 5000)
    )
    
    const { data: profile } = await Promise.race([
      profilePromise,
      profileTimeoutPromise
    ]).catch((error) => {
      // Profile fetch timeout or error - continue with user metadata only
      console.warn('[AUTH] Profile fetch timeout/error:', error)
      return { data: null }
    })

    return {
      id: user.id,
      email: user.email || '',
      full_name: profile?.full_name || user.user_metadata?.name || null,
      lab_name: profile?.lab_name || null,
      avatar_url: profile?.avatar_url || null,
      institution: profile?.institution || null,
      department: profile?.department || null,
      profile_picture_url: profile?.profile_picture_url || null
    }
  } catch (error) {
    console.error('[AUTH] getCurrentUser error:', error)
    return null
  }
}

// Update user profile
export async function updateProfile(updates: {
  full_name?: string
  lab_name?: string
  avatar_url?: string
  bio?: string
  institution?: string
  department?: string
  location?: string
  website?: string
  linkedin?: string
  orcid?: string
  skills?: string[]
  interests?: string[]
  profile_picture_url?: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Update profiles table (single source of truth)
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}
// Listen to auth state changes
// Returns callback with user and sessionId to allow comparison
export function onAuthStateChange(callback: (user: User | null, sessionId: string | null) => void) {
  let lastSessionId: string | null = null
  let lastUserId: string | null = null
  
  return supabase.auth.onAuthStateChange(async (event, session) => {
    const currentSessionId = session?.access_token || null
    const currentUserId = session?.user?.id || null
    
    // Only process if session or user actually changed (not just tab focus events)
    // This prevents unnecessary updates when tabs regain focus
    if (currentSessionId === lastSessionId && currentUserId === lastUserId) {
      // Session and user haven't changed - skip callback to prevent unnecessary updates
      return
    }
    
    lastSessionId = currentSessionId
    lastUserId = currentUserId
    
    if (session?.user) {
      // Use setTimeout to prevent blocking the callback
      // This prevents one hanging getCurrentUser from blocking all auth updates
      setTimeout(async () => {
        try {
          const user = await getCurrentUser()
          callback(user, currentSessionId)
        } catch (error) {
          console.error('[AUTH] Error in onAuthStateChange callback:', error)
          // Fallback: use session data directly if getCurrentUser fails
          callback({
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.name || null,
            lab_name: null,
            avatar_url: null,
            institution: session.user.user_metadata?.institution || null,
            department: session.user.user_metadata?.department || null,
            profile_picture_url: null
          }, currentSessionId)
        }
      }, 0)
    } else {
      callback(null, null)
    }
  })
}

