"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BeakerIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn, signUp } from "@/lib/auth-service"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [institution, setInstitution] = useState("")
  const [fieldOfStudy, setFieldOfStudy] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

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

    try {
      if (isSignUp) {
        // Store additional profile data for after email verification
        const profileData = {
          full_name: fullName,
          institution: institution,
          field_of_study: fieldOfStudy
        }
        localStorage.setItem('pendingProfileData', JSON.stringify(profileData))
        
        await signUp(email, password, fullName)
        router.push("/verify-email-sent")
      } else {
        await signIn(email, password)
        router.push("/dashboard")
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <BeakerIcon className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Knowledge Capture</span>
          </div>
          <div>
            <CardTitle className="text-2xl">
              {isSignUp ? "Create Account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {isSignUp ? "Sign up for your research project" : "Sign in to your research project"}
            </CardDescription>
          </div>
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
                  <Label htmlFor="fieldOfStudy">Primary Field of Study</Label>
                  <Select value={fieldOfStudy} onValueChange={setFieldOfStudy} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="computer_science">Computer Science</SelectItem>
                      <SelectItem value="biology">Biology</SelectItem>
                      <SelectItem value="chemistry">Chemistry</SelectItem>
                      <SelectItem value="physics">Physics</SelectItem>
                      <SelectItem value="mathematics">Mathematics</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="medicine">Medicine</SelectItem>
                      <SelectItem value="psychology">Psychology</SelectItem>
                      <SelectItem value="economics">Economics</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="arts">Arts & Humanities</SelectItem>
                      <SelectItem value="social_sciences">Social Sciences</SelectItem>
                      <SelectItem value="environmental">Environmental Science</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className={`text-sm p-3 rounded-md ${
                error.includes("successfully") 
                  ? "text-green-600 bg-green-50" 
                  : "text-red-600 bg-red-50"
              }`}>
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (isSignUp ? "Creating Account..." : "Signing in...") : (isSignUp ? "Create Account" : "Sign In")}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to homepage
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
