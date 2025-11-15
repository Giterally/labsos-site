"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUser } from "@/lib/user-context"
import { useChatSidebar } from "@/lib/chat-sidebar-context"
import { ChatBubbleLeftRightIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { cn } from "@/lib/utils"

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [submitMessage, setSubmitMessage] = useState("")
  const { user } = useUser()
  const { isChatOpen } = useChatSidebar()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitMessage("")

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          email: user?.email || email
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setSubmitMessage('Thank you for your feedback!')
        setMessage("")
        setEmail("")
        setTimeout(() => {
          setIsOpen(false)
          setSubmitMessage("")
        }, 2000)
      } else {
        setSubmitMessage(`Failed to submit feedback: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error:', error)
      setSubmitMessage('Failed to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating Feedback Button */}
      <div className={cn(
        "fixed bottom-6 z-50 flex items-center space-x-2 transition-all duration-300",
        isChatOpen ? "left-6" : "right-6"
      )}>
        <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm">
          Send Feedback
        </span>
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          style={{ backgroundColor: '#1B5E20' }}
          size="lg"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6 text-white" />
        </Button>
      </div>

      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg font-semibold">Send Feedback</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="message">Your feedback *</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you think, report a bug, or suggest a feature..."
                    rows={4}
                    required
                  />
                </div>

                {!user && (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll use this to follow up if needed
                    </p>
                  </div>
                )}

                {user && (
                  <p className="text-xs text-muted-foreground">
                    Feedback will be associated with your account ({user.email})
                  </p>
                )}

                {submitMessage && (
                  <div className={`p-3 rounded-md text-sm ${
                    submitMessage.includes('Thank you') 
                      ? 'bg-green-50 text-green-800' 
                      : 'bg-red-50 text-red-800'
                  }`}>
                    {submitMessage}
                  </div>
                )}

                <div className="flex space-x-3">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="flex-1"
                    style={{ backgroundColor: '#1B5E20' }}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Feedback'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
