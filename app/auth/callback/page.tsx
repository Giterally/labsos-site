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
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth callback error:', error)
          setStatus('error')
          setMessage('Authentication failed. Please try again.')
          return
        }

        if (data.session?.user) {
            // Check if email is verified
            if (data.session.user.email_confirmed_at) {
              // Email is verified, create profile if we have pending data
              const pendingProfileData = localStorage.getItem('pendingProfileData')
              if (pendingProfileData) {
                try {
                  const profileData = JSON.parse(pendingProfileData)
                  
                  // Update profile in profiles table (profile already exists from trigger)
                  const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                      id: data.session.user.id,
                      email: data.session.user.email,
                      full_name: profileData.full_name,
                      lab_name: profileData.institution,
                      institution: profileData.institution,
                      department: profileData.field_of_study,
                      updated_at: new Date().toISOString()
                    })

                  if (profileError) {
                    console.error('Profile creation error:', profileError)
                  }

                  // Clear pending profile data
                  localStorage.removeItem('pendingProfileData')
                } catch (error) {
                  console.error('Error creating profile:', error)
                }
              }

            setStatus('success')
            setMessage('Email verified successfully! Redirecting to dashboard...')
            
            // Redirect to dashboard after 2 seconds
            setTimeout(() => {
              router.push('/dashboard')
            }, 2000)
          } else {
            setStatus('error')
            setMessage('Email not verified. Please check your email and try again.')
          }
        } else {
          setStatus('error')
          setMessage('No active session found. Please sign up again.')
        }
      } catch (error) {
        console.error('Error handling auth callback:', error)
        setStatus('error')
        setMessage('An error occurred. Please try again.')
      }
    }

    handleAuthCallback()
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
