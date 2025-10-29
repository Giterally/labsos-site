import { NextRequest } from 'next/server'
import { createAuthenticatedClient } from './supabase-server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface AuthContext {
  supabase: SupabaseClient
  user: User
}

/**
 * Authenticate a request and return authenticated Supabase client + user
 * Throws AuthError if authentication fails
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthContext> {
  const authHeader = request.headers.get('authorization')
  
  console.log('DEBUG: Auth header present:', !!authHeader)
  console.log('DEBUG: Auth header value:', authHeader ? `${authHeader.substring(0, 20)}...` : 'None')
  
  if (!authHeader) {
    throw new AuthError('No authorization header', 401)
  }
  
  const token = authHeader.replace('Bearer ', '')
  console.log('DEBUG: Token length:', token.length)
  console.log('DEBUG: Token starts with:', token.substring(0, 20))
  
  try {
    const { client, user } = await createAuthenticatedClient(token)
    console.log('DEBUG: Authentication successful for user:', user.email)
    console.log('DEBUG: User ID from token:', user.id)
    return { supabase: client, user }
  } catch (error) {
    console.error('DEBUG: Authentication failed:', error)
    throw new AuthError('Invalid or expired token', 401)
  }
}

/**
 * Try to authenticate request, return null if no auth (for public endpoints)
 */
export async function tryAuthenticateRequest(request: NextRequest): Promise<AuthContext | null> {
  try {
    return await authenticateRequest(request)
  } catch {
    return null
  }
}
