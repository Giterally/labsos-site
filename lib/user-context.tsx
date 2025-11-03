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

  // Keep ref in sync with state for health check
  useEffect(() => {
    userRef.current = user
  }, [user])

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser(true) // Force refresh to get latest data
      setUser(currentUser)
    } catch (error) {
      console.error('Error refreshing user:', error)
      setUser(null)
    }
  }, [])

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

        await refreshUser()

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
      } = onAuthStateChange((authUser) => {
        if (!isMounted) return

        if (authUser) {
          // User logged in elsewhere in the app
          setUser(authUser)
          if (loadingTimeout) {
            clearTimeout(loadingTimeout)
          }
          setLoading(false)
          return
        }

        // User logged out
        setUser(null)
        if (loadingTimeout) {
          clearTimeout(loadingTimeout)
        }
        setLoading(false)
      })

      authSubscription = subscription
    }

    // Add visibility change recovery
    const handleVisibilityChange = () => {
      if (document.hidden) {
        return
      }

      // Refresh auth when tab becomes visible after being hidden
      const wasHidden = sessionStorage.getItem('tab_was_hidden') === 'true'
      if (wasHidden && isMounted) {
        sessionStorage.removeItem('tab_was_hidden')
        setTimeout(() => {
          if (isMounted) {
            refreshUser().catch(console.error)
          }
        }, 500)
      }
    }

    // Track when tab becomes hidden
    const handleHidden = () => {
      sessionStorage.setItem('tab_was_hidden', 'true')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleHidden)

    // Periodic health check (every 30 seconds)
    healthCheckInterval = setInterval(() => {
      if (!document.hidden && isMounted) {
        // Silently check if auth is still valid
        supabase.auth.getSession()
          .then(({ data: { session } }) => {
            if (isMounted && !session && userRef.current) {
              console.warn('[AUTH] Health check: session lost, clearing user')
              setUser(null)
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
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleHidden)
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
