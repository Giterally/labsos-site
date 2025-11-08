"use client"

import type React from "react"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BeakerIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, signUp } from "@/lib/auth-service"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [institution, setInstitution] = useState("")
  const [fieldOfStudy, setFieldOfStudy] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(true)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showVerifiedSuccess, setShowVerifiedSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Check for verified query parameter
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setShowVerifiedSuccess(true)
      setIsSignUp(false) // Switch to sign in mode
      // Clean up URL by removing query param
      router.replace('/login', { scroll: false })
    }
  }, [searchParams, router])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Basic validation
    if (!email || !password) {
      setError("Please fill in all fields")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

    if (isSignUp && !fullName) {
      setError("Please enter your full name")
      setIsLoading(false)
      return
    }

    if (isSignUp && !institution) {
      setError("Please enter your university/institution")
      setIsLoading(false)
      return
    }

    if (isSignUp && !fieldOfStudy) {
      setError("Please select your primary field of study")
      setIsLoading(false)
      return
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (isSignUp) {
      const { error: signUpError } = await signUp(email, password, fullName, institution, fieldOfStudy)
      
      console.log('SignUp result:', { signUpError, email })
      
      if (signUpError) {
        console.log('SignUp error details:', signUpError)
        setError(signUpError.message || "Failed to create account. Please try again.")
        setIsLoading(false)
        return
      }
      
      router.push("/verify-email-sent")
    } else {
      const { error: signInError } = await signIn(email, password)
      
      if (signInError) {
        setError(signInError.message || "Failed to sign in. Please check your credentials.")
        setIsLoading(false)
        return
      }
      
      router.push("/dashboard")
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div>
            <CardTitle className="text-2xl">
              {isSignUp ? "Create Account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {isSignUp ? "Sign up for your research project" : "Sign in to your account"}
            </CardDescription>
          </div>
          {isSignUp && (
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false)
                  setError(null)
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Already have an account? Sign in
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  ← Back to homepage
                </button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institution">University/Institution</Label>
                  <Input
                    id="institution"
                    type="text"
                    placeholder="Stanford University"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fieldOfStudy">Department</Label>
                  <Select value={fieldOfStudy} onValueChange={setFieldOfStudy} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Computer Science">Computer Science</SelectItem>
                      <SelectItem value="Biology">Biology</SelectItem>
                      <SelectItem value="Chemistry">Chemistry</SelectItem>
                      <SelectItem value="Physics">Physics</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Medicine">Medicine</SelectItem>
                      <SelectItem value="Psychology">Psychology</SelectItem>
                      <SelectItem value="Economics">Economics</SelectItem>
                      <SelectItem value="Business">Business</SelectItem>
                      <SelectItem value="Education">Education</SelectItem>
                      <SelectItem value="Arts & Humanities">Arts & Humanities</SelectItem>
                      <SelectItem value="Social Sciences">Social Sciences</SelectItem>
                      <SelectItem value="Environmental Science">Environmental Science</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="jane.smith@university.edu"
                value={email}
                onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
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
              {!isSignUp && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => router.push("/reset-password")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </div>
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {confirmPassword && (
                  <p className={`text-sm ${password === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>
            )}
            {showVerifiedSuccess && (
              <div className="text-sm p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-green-600 dark:text-green-400 font-medium">
                  ✓ Email verified successfully! Please sign in to continue.
                </p>
              </div>
            )}
            {error && (
              <div className="text-sm p-3 rounded-md bg-red-50 border border-red-200">
                <p className="text-red-600 font-medium">
                  {error}
                </p>
                {error.includes("verification email") && (
                  <p className="text-red-500 text-xs mt-2">
                    Didn't receive it? Please wait 24 hours and try signing up again.
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (isSignUp ? "Creating Account..." : "Signing in...") : (isSignUp ? "Create Account" : "Sign In")}
            </Button>
          </form>
          {!isSignUp && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError(null)
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Don't have an account? Sign up
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
