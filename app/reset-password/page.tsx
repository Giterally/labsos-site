"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EyeIcon, EyeSlashIcon, EnvelopeIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline"
import { resetPasswordForEmail } from "@/lib/auth-service"
import { supabase } from "@/lib/supabase-client"

type PageState = "email-request" | "email-sent" | "password-reset" | "error" | "loading"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageState, setPageState] = useState<PageState>("email-request")
  const [errorMessage, setErrorMessage] = useState<string>("")

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let checkIntervalId: NodeJS.Timeout | null = null
    let handled = false

    const handlePasswordRecovery = async () => {
      try {
        // Check for token in URL query parameters or hash
        const urlParams = new URLSearchParams(window.location.search)
        const tokenHash = urlParams.get('token_hash')
        const type = urlParams.get('type')
        const code = urlParams.get('code') // PKCE flow uses 'code' parameter

        // Set up listener for PASSWORD_RECOVERY event
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'PASSWORD_RECOVERY' && !handled) {
            handled = true
            setPageState("password-reset")
            if (subscription) subscription.unsubscribe()
            if (timeoutId) clearTimeout(timeoutId)
            if (checkIntervalId) clearInterval(checkIntervalId)
          }
        })
        subscription = authSubscription

        // If code, token_hash, or type exists, Supabase should process it
        // With detectSessionInUrl: true, Supabase automatically processes the code
        if (code || tokenHash || type === 'recovery') {
          // Check session state periodically to catch recovery mode
          // When Supabase processes a recovery code, it creates a session in recovery state
          // The PASSWORD_RECOVERY event should fire, but we check session as backup
          const checkRecoveryState = async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession()
              // If we have a session after processing a recovery code/token,
              // and we're on this page with a code, we're in recovery mode
              // Note: This is a heuristic - ideally PASSWORD_RECOVERY event fires
              if (session?.user && !handled && (code || tokenHash || type === 'recovery')) {
                // Show password reset form - user is in recovery mode
                handled = true
                setPageState("password-reset")
                if (subscription) subscription.unsubscribe()
                if (timeoutId) clearTimeout(timeoutId)
                if (checkIntervalId) clearInterval(checkIntervalId)
              }
            } catch (error) {
              console.error('Error checking recovery state:', error)
            }
          }

          // Check immediately after a short delay (give Supabase time to process code)
          setTimeout(() => {
            if (!handled) {
              checkRecoveryState()
            }
          }, 1000)

          // Also check periodically (every 800ms) for up to 4 seconds
          // This gives Supabase time to process the code and fire the event
          let checkCount = 0
          checkIntervalId = setInterval(() => {
            if (!handled && checkCount < 5) {
              checkRecoveryState()
              checkCount++
            } else {
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          }, 800)

          // Fallback timeout - if no recovery detected after 6 seconds, show error
          // This gives enough time for Supabase to process the code and fire events
          timeoutId = setTimeout(() => {
            if (!handled) {
              handled = true
              setPageState("error")
              setErrorMessage("Invalid or expired reset link. Please request a new password reset.")
              if (subscription) subscription.unsubscribe()
              if (checkIntervalId) clearInterval(checkIntervalId)
            }
          }, 6000)
        } else {
          // No token/code in URL - user navigated here directly, show email form
          // This is already the default state, so no action needed
        }
      } catch (error) {
        console.error('Error handling password recovery:', error)
        if (!handled) {
          handled = true
          setPageState("error")
          setErrorMessage("An error occurred. Please try again.")
          if (subscription) subscription.unsubscribe()
          if (timeoutId) clearTimeout(timeoutId)
          if (checkIntervalId) clearInterval(checkIntervalId)
        }
      }
    }

    handlePasswordRecovery()

    // Cleanup on unmount
    return () => {
      if (subscription) subscription.unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
      if (checkIntervalId) clearInterval(checkIntervalId)
    }
  }, [router])

  // Handle error state redirect
  useEffect(() => {
    if (pageState === "error" && errorMessage.includes("Invalid or expired")) {
      const redirectTimer = setTimeout(() => {
        router.push("/login")
      }, 3000)
      return () => clearTimeout(redirectTimer)
    }
  }, [pageState, errorMessage, router])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!email) {
      setError("Please enter your email address")
      setIsLoading(false)
      return
    }

    const { error: resetError } = await resetPasswordForEmail(email)

    if (resetError) {
      setError(resetError.message || "Failed to send reset email. Please try again.")
      setIsLoading(false)
      return
    }

    setPageState("email-sent")
    setIsLoading(false)
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validation
    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields")
      setIsLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      setError(updateError.message || "Failed to update password. Please try again.")
      setIsLoading(false)
      return
    }

    // Password updated successfully - user should be automatically signed in
    // The onAuthStateChange listener will handle redirect to dashboard
    // But we can also redirect directly after a short delay
    setTimeout(() => {
      router.push("/dashboard")
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {pageState === "email-request" && (
            <>
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your email address and we'll send you a link to reset your password.
              </CardDescription>
            </>
          )}
          {pageState === "email-sent" && (
            <>
              <EnvelopeIcon className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                We've sent a password reset link to {email}. Please check your email and click the link to reset your password.
              </CardDescription>
            </>
          )}
          {pageState === "password-reset" && (
            <>
              <CardTitle className="text-2xl">Set New Password</CardTitle>
              <CardDescription>
                Enter your new password below.
              </CardDescription>
            </>
          )}
          {pageState === "error" && (
            <>
              <ExclamationCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <CardTitle className="text-2xl text-red-600">Error</CardTitle>
              <CardDescription>
                {errorMessage || "An error occurred. Please try again."}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {pageState === "email-request" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  required
                />
              </div>
              {error && (
                <div className="text-sm p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-red-600 font-medium">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {pageState === "email-sent" && (
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                <p>Didn't receive the email? Check your spam folder.</p>
                <p className="mt-2">The reset link will expire after a period of time.</p>
              </div>
              <Button
                onClick={() => router.push("/login")}
                className="w-full"
              >
                Back to Login
              </Button>
            </div>
          )}

          {pageState === "password-reset" && (
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your new password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setError(null)
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setError(null)
                    }}
                    required
                  />
                </div>
                {confirmPassword && (
                  <p className={`text-sm ${newPassword === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                    {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>
              {error && (
                <div className="text-sm p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-red-600 font-medium">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Updating Password..." : "Update Password"}
              </Button>
            </form>
          )}

          {pageState === "error" && (
            <div className="space-y-4">
              <Button
                onClick={() => router.push("/login")}
                className="w-full"
              >
                Back to Login
              </Button>
              {errorMessage.includes("Invalid or expired") && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setPageState("email-request")
                      setErrorMessage("")
                      setError(null)
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Request a new reset link
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

