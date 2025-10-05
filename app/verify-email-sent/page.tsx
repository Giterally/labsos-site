"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EnvelopeIcon, CheckCircleIcon } from "@heroicons/react/24/outline"
import { useRouter } from "next/navigation"

export default function VerifyEmailSentPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <EnvelopeIcon className="h-12 w-12 text-blue-500 mx-auto" />
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription>
            We've sent you a verification link. Please check your email and click the link to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Didn't receive the email? Check your spam folder.</p>
            <p className="mt-2">The verification link will expire in 24 hours.</p>
          </div>
          <Button
            onClick={() => router.push('/login')}
            className="w-full"
          >
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
