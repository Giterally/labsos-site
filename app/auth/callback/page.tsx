"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline"
import { supabase } from '@/lib/supabase-client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let checkIntervalId: NodeJS.Timeout | null = null
    let handled = false

    const handleAuthCallback = async () => {
      try {
        // Supabase verifies email server-side at their domain, then redirects here
        // By the time we reach this callback, verification is done - we just wait for session
        // detectSessionInUrl: true will automatically process any session info in the URL

        // Set up listener for auth state change (fires when Supabase processes the redirect)
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Session established - email was verified by Supabase server-side
            if (session?.user?.email_confirmed_at && !handled) {
              handled = true
              setStatus('success')
              setMessage('Email verified successfully! Redirecting to login...')
              setTimeout(() => router.push('/login?verified=true'), 2000)
              if (subscription) subscription.unsubscribe()
              if (timeoutId) clearTimeout(timeoutId)
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          }
        })
        subscription = authSubscription

        // Check for immediate session (in case Supabase already processed it)
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth callback error:', error)
          if (!handled) {
            handled = true
            setStatus('error')
            setMessage('Authentication failed. Please try again.')
          }
          return
        }

        if (data.session?.user && !handled) {
          // Session exists - check if email is verified
          if (data.session.user.email_confirmed_at) {
            handled = true
            setStatus('success')
            setMessage('Email verified successfully! Redirecting to login...')
            setTimeout(() => router.push('/login?verified=true'), 2000)
            if (checkIntervalId) clearInterval(checkIntervalId)
            return
          }
        }

        // Periodically check for session (give Supabase time to process redirect)
        const checkSessionState = async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user?.email_confirmed_at && !handled) {
              handled = true
              setStatus('success')
              setMessage('Email verified successfully! Redirecting to login...')
              setTimeout(() => router.push('/login?verified=true'), 2000)
              if (subscription) subscription.unsubscribe()
              if (timeoutId) clearTimeout(timeoutId)
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          } catch (error) {
            console.error('Error checking session state:', error)
          }
        }

        // Check immediately after a short delay
        setTimeout(() => {
          if (!handled) {
            checkSessionState()
          }
        }, 1000)

        // Also check periodically (every 800ms) for up to 10 seconds
        let checkCount = 0
        checkIntervalId = setInterval(() => {
          if (!handled && checkCount < 12) {
            checkSessionState()
            checkCount++
          } else {
            if (checkIntervalId) clearInterval(checkIntervalId)
          }
        }, 800)

        // Fallback timeout - if no session after 15 seconds, show error
        if (!handled) {
          timeoutId = setTimeout(() => {
            if (!handled) {
              handled = true
              setStatus('error')
              setMessage('Verification timed out. Please try again or sign up again.')
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          }, 15000)
        }
      } catch (error) {
        console.error('Error handling auth callback:', error)
        if (!handled) {
          handled = true
          setStatus('error')
          setMessage('An error occurred. Please try again.')
        }
      }
    }

    handleAuthCallback()

    // Cleanup on unmount
    return () => {
      if (subscription) subscription.unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
      if (checkIntervalId) clearInterval(checkIntervalId)
    }
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <CardTitle className="text-2xl">Verifying Email...</CardTitle>
              <CardDescription>Please wait while we verify your email address.</CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl text-green-600">Email Verified!</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <ExclamationCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <CardTitle className="text-2xl text-red-600">Verification Error</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'error' && (
            <div className="space-y-3">
              <Button
                onClick={() => router.push('/login')}
                className="w-full"
              >
                Back to Login
              </Button>
            </div>
          )}

          {status === 'success' && (
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
