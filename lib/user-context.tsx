"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { getCurrentUser, onAuthStateChange, User } from '@/lib/auth-service'
import { supabase } from './supabase-client'

interface UserContextType {
  user: User | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)
  const sessionIdRef = useRef<string | null>(null) // Track session ID to prevent unnecessary updates

  // Keep ref in sync with state for health check
  useEffect(() => {
    userRef.current = user
  }, [user])

  // Stabilized user update - only updates if user data actually changed
  const updateUser = useCallback((newUser: User | null) => {
    setUser(prev => {
      // If both are null, no change
      if (!prev && !newUser) return prev
      
      // If one is null and other isn't, definitely changed
      if (!prev || !newUser) return newUser
      
      // Compare key fields to determine if user actually changed
      const prevKey = `${prev.id}-${prev.email}`
      const newKey = `${newUser.id}-${newUser.email}`
      
      // Only update if the key fields changed
      if (prevKey !== newKey) {
        return newUser
      }
      
      // If keys match, keep the same reference to prevent unnecessary re-renders
      return prev
    })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser(true) // Force refresh to get latest data
      updateUser(currentUser)
    } catch (error) {
      console.error('Error refreshing user:', error)
      updateUser(null)
    }
  }, [updateUser])

  useEffect(() => {
    let isMounted = true
    let authSubscription: { unsubscribe: () => void } | null = null
    let loadingTimeout: NodeJS.Timeout | null = null
    let healthCheckInterval: NodeJS.Timeout | null = null

    // Initialize auth with timeout protection
    const initAuth = async () => {
      try {
        // Set a maximum loading time - never block UI indefinitely
        loadingTimeout = setTimeout(() => {
          if (isMounted) {
            console.warn('[AUTH] Loading timeout reached, proceeding with null user')
            setLoading(false)
          }
        }, 10000) // 10 second max loading time

        const initialUser = await getCurrentUser(true)
        updateUser(initialUser)
        
        // Get initial session ID
        const { data: { session } } = await supabase.auth.getSession()
        sessionIdRef.current = session?.access_token || null

        if (isMounted && loadingTimeout) {
          clearTimeout(loadingTimeout)
          setLoading(false)
        }
      } catch (error) {
        console.error('[AUTH] Init error:', error)
        if (isMounted) {
          if (loadingTimeout) {
            clearTimeout(loadingTimeout)
          }
          setLoading(false)
        }
      }
    }

    initAuth()

    // Set up auth state listener for login/logout events
    if (isMounted) {
      const {
        data: { subscription },
      } = onAuthStateChange((authUser, sessionId) => {
        if (!isMounted) return

        // Only update if session actually changed
        if (sessionIdRef.current === sessionId && userRef.current?.id === authUser?.id) {
          // Session and user haven't changed, skip update
          return
        }

        sessionIdRef.current = sessionId

        if (authUser) {
          // User logged in elsewhere in the app
          updateUser(authUser)
          if (loadingTimeout) {
            clearTimeout(loadingTimeout)
          }
          setLoading(false)
          return
        }

        // User logged out
        updateUser(null)
        sessionIdRef.current = null
        if (loadingTimeout) {
          clearTimeout(loadingTimeout)
        }
        setLoading(false)
      })

      authSubscription = subscription
    }

    // Periodic health check (every 30 seconds)
    // This handles session validation - no need for visibility change refresh
    healthCheckInterval = setInterval(() => {
      if (!document.hidden && isMounted) {
        // Silently check if auth is still valid
        supabase.auth.getSession()
          .then(({ data: { session } }) => {
            if (isMounted && !session && userRef.current) {
              console.warn('[AUTH] Health check: session lost, clearing user')
              updateUser(null)
              sessionIdRef.current = null
            } else if (isMounted && session?.access_token !== sessionIdRef.current) {
              // Session changed, update the ref but don't trigger state update
              // (onAuthStateChange will handle the actual state update)
              sessionIdRef.current = session.access_token
            }
          })
          .catch(() => {
            // Ignore health check errors
          })
      }
    }, 30000)

    return () => {
      isMounted = false
      if (loadingTimeout) {
        clearTimeout(loadingTimeout)
      }
      if (authSubscription) {
        authSubscription.unsubscribe()
      }
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval)
      }
    }
  }, [refreshUser])

  return (
    <UserContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
