"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { useUser } from "@/lib/user-context"

export default function PrivacyTermsPage() {
  const { user, loading } = useUser()
  const isAuthenticated = !loading && !!user

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className={`border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky z-20 ${isAuthenticated ? 'top-20' : 'top-0'}`}>
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          {!isAuthenticated && (
            <div className="flex items-center space-x-2">
              <Image
                src="/olvaro-fin copy.png"
                alt="Olvaro Logo"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-2xl font-bold text-foreground">Olvaro</span>
            </div>
          )}
          <Link href="/">
            <Button variant="outline" className="flex items-center space-x-2">
              <ArrowLeftIcon className="h-4 w-4" />
              <span>Back to Home</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-4">Privacy Policy & Terms of Service</h1>
            <p className="text-lg text-muted-foreground">
              Last updated: October 2025
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Privacy Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Data Storage and Security</h3>
                <p className="text-muted-foreground mb-4">
                  Your data is stored securely using <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:underline">Supabase</a>, which provides enterprise-grade security 
                  including encryption at rest and in transit. We implement Row Level Security (RLS) 
                  policies to ensure you can only access your own data.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>All data is encrypted using industry-standard encryption</li>
                  <li>Access controls ensure only authorized users can view your content</li>
                  <li>Regular security audits and monitoring</li>
                  <li>Data is stored in secure, compliant data centers</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Information We Collect</h3>
                <p className="text-muted-foreground mb-4">
                  We collect information you provide directly to us, such as when you create an account, 
                  use our services, or contact us for support.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Account information (name, email address, university affiliation)</li>
                  <li>Research project data and content you choose to store</li>
                  <li>Communication data when you contact us</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">How We Use Your Information</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Provide and maintain our research knowledge capture services</li>
                  <li>Process and store your research data as requested</li>
                  <li>Communicate with you about your account and our services</li>
                  <li>Improve our platform and develop new features</li>
                  <li>Ensure security and prevent abuse</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Your Rights and Choices</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Access, update, or delete your account information</li>
                  <li>Export your research data at any time</li>
                  <li>Control the visibility of your projects (public/private)</li>
                  <li>Request deletion of your account and associated data</li>
                  <li>Opt out of non-essential communications</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Terms of Service</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Acceptable Use</h3>
                <p className="text-muted-foreground mb-4">
                  By using Olvaro, you agree to use our services responsibly and in accordance with 
                  applicable laws and regulations.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Use the service for legitimate research and academic purposes</li>
                  <li>Respect intellectual property rights of others</li>
                  <li>Do not attempt to compromise the security of our systems</li>
                  <li>Do not use the service for illegal or harmful activities</li>
                  <li>Maintain the confidentiality of any sensitive research data</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Content and Data Ownership</h3>
                <p className="text-muted-foreground mb-4">
                  You retain full ownership of your research data and content. We do not claim 
                  ownership of your intellectual property.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>You own all content you upload to Olvaro</li>
                  <li>You can export your data at any time</li>
                  <li>You control who can access your projects</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Project Visibility Controls</h3>
                <p className="text-muted-foreground mb-4">
                  You have full control over the visibility of your research projects:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><strong>Private:</strong> Only you and invited team members can access</li>
                  <li><strong>Public:</strong> Visible to other researchers on the platform</li>
                  <li>You can change visibility settings at any time</li>
                  <li>Public projects help the research community discover your work</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Service Availability</h3>
                <p className="text-muted-foreground mb-4">
                  We strive to provide reliable service, but cannot guarantee 100% uptime. 
                  We will provide reasonable notice for planned maintenance.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Account Termination</h3>
                <p className="text-muted-foreground mb-4">
                  You may terminate your account at any time. We may suspend or terminate 
                  accounts that violate these terms.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>You can delete your account through your profile settings</li>
                  <li>You can export your data before account deletion</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Changes to Terms</h3>
                <p className="text-muted-foreground">
                  We may update these terms from time to time. We will notify users of 
                  significant changes via email or through the platform.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Questions about our privacy policy or terms of service?
            </p>
            <Link href="/?contact=true">
              <Button>Contact Us</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
