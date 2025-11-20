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
        // DEBUG: Log complete URL information
        console.log('[Auth Callback] Full URL:', window.location.href)
        console.log('[Auth Callback] Search params:', window.location.search)
        console.log('[Auth Callback] Hash fragment:', window.location.hash)

        // Parse URL parameters
        const searchParams = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        
        console.log('[Auth Callback] Search params object:', Object.fromEntries(searchParams))
        console.log('[Auth Callback] Hash params object:', Object.fromEntries(hashParams))

        // Check for PKCE code parameter (Supabase sends this after server-side verification)
        const code = searchParams.get('code')
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')
        
        console.log('[Auth Callback] PKCE code found:', code)
        console.log('[Auth Callback] Token hash found:', tokenHash)
        console.log('[Auth Callback] Type found:', type)

        // If PKCE code exists, manually exchange it for a session
        // detectSessionInUrl might not always work, so we do it explicitly
        if (code && !handled) {
          console.log('[Auth Callback] Exchanging PKCE code for session...')
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error('[Auth Callback] Code exchange error:', exchangeError)
            // Continue to normal flow - might still work via detectSessionInUrl
          } else if (exchangeData?.session?.user) {
            console.log('[Auth Callback] Session established via code exchange:', {
              userId: exchangeData.session.user.id,
              email: exchangeData.session.user.email,
              emailConfirmed: exchangeData.session.user.email_confirmed_at
            })
            
            if (exchangeData.session.user.email_confirmed_at) {
              handled = true
              setStatus('success')
              setMessage('Email verified successfully! Redirecting to login...')
              setTimeout(() => router.push('/login?verified=true'), 2000)
              if (subscription) subscription.unsubscribe()
              if (timeoutId) clearTimeout(timeoutId)
              if (checkIntervalId) clearInterval(checkIntervalId)
              return
            }
          }
        }

        // Set up listener for auth state change (fires when Supabase processes the redirect)
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('[Auth Callback] Auth state change:', event, {
            hasSession: !!session,
            userId: session?.user?.id,
            email: session?.user?.email,
            emailConfirmed: session?.user?.email_confirmed_at
          })
          
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
        
        console.log('[Auth Callback] Immediate session check:', {
          hasSession: !!data.session,
          hasError: !!error,
          error: error?.message,
          userId: data.session?.user?.id,
          emailConfirmed: data.session?.user?.email_confirmed_at
        })

        if (error) {
          console.error('[Auth Callback] Session check error:', error)
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
            console.log('[Auth Callback] Session found with verified email, redirecting...')
            handled = true
            setStatus('success')
            setMessage('Email verified successfully! Redirecting to login...')
            setTimeout(() => router.push('/login?verified=true'), 2000)
            if (checkIntervalId) clearInterval(checkIntervalId)
            return
          } else {
            console.log('[Auth Callback] Session found but email not confirmed yet')
          }
        }

        // Periodically check for session (give Supabase time to process redirect)
        const checkSessionState = async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user?.email_confirmed_at && !handled) {
              console.log('[Auth Callback] Session detected in periodic check, redirecting...')
              handled = true
              setStatus('success')
              setMessage('Email verified successfully! Redirecting to login...')
              setTimeout(() => router.push('/login?verified=true'), 2000)
              if (subscription) subscription.unsubscribe()
              if (timeoutId) clearTimeout(timeoutId)
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          } catch (error) {
            console.error('[Auth Callback] Error checking session state:', error)
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
