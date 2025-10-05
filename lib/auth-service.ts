import { supabase } from './supabase-client'

export interface User {
  id: string
  email: string
  full_name: string | null
  lab_name: string | null
  avatar_url: string | null
  institution?: string
  field_of_study?: string
  profile_picture_url?: string
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

// Sign up with email and password
export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: fullName
      },
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) {
    console.error('Signup error:', error)
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

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    throw error
  }
}

// Get current user
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }

  // Get profile data from user_profiles table (the new structure)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Fallback to profiles table if user_profiles doesn't exist
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email || '',
    full_name: userProfile?.full_name || profile?.full_name || user.user_metadata?.name || null,
    lab_name: profile?.lab_name || null,
    avatar_url: profile?.avatar_url || null,
    institution: userProfile?.institution || null,
    field_of_study: userProfile?.field_of_study || null,
    profile_picture_url: userProfile?.profile_picture_url || null
  }
}

// Update user profile
export async function updateProfile(updates: {
  full_name?: string
  lab_name?: string
  avatar_url?: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Try to update user_profiles table first
  const { data: userProfile, error: userProfileError } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single()

  if (!userProfileError) {
    return userProfile
  }

  // Fallback to profiles table
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
export function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user = await getCurrentUser()
      callback(user)
    } else {
      callback(null)
    }
  })
}

