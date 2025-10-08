"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getCurrentUser, onAuthStateChange, User } from '@/lib/auth-service'

interface UserContextType {
  user: User | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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
    // Get initial user on mount
    refreshUser().finally(() => {
      setLoading(false)
    })

    // Set up auth state listener for login/logout only
    const { data: { subscription } } = onAuthStateChange((authUser) => {
      if (!authUser) {
        // User logged out
        setUser(null)
      }
      // Don't refresh on login - the initial mount handles that
    })

    return () => {
      subscription?.unsubscribe()
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
