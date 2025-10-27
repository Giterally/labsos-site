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
  
  if (!authHeader) {
    throw new AuthError('No authorization header', 401)
  }
  
  const token = authHeader.replace('Bearer ', '')
  
  try {
    const { client, user } = await createAuthenticatedClient(token)
    return { supabase: client, user }
  } catch (error) {
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
