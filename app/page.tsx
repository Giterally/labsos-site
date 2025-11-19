"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FolderIcon,
  LinkIcon,
  DocumentTextIcon,
  TagIcon,
  LockClosedIcon,
  BeakerIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  PlayIcon,
  CodeBracketIcon,
  VideoCameraIcon,
  CircleStackIcon,
  ShareIcon,
  ArrowRightIcon,
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect, Suspense, useMemo, memo, useCallback, useRef } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useUser } from "@/lib/user-context"
import { KnowledgeNodesBackground } from "@/components/KnowledgeNodesBackground"
import { ConnectorLines } from "@/components/ConnectorLines"
import Image from "next/image"
import { Sun, Moon, Sparkles } from "lucide-react"
import { useTheme } from "next-themes"

// Animated Word Component - Optimized with requestAnimationFrame
const AnimatedWord = memo(({ words }: { words: string[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displayedText, setDisplayedText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const animationFrameRef = useRef<number>()
  const lastUpdateRef = useRef(0)
  const pauseUntilRef = useRef(0)

  useEffect(() => {
    const animate = (currentTime: number) => {
      // Throttle to ~10fps for typing animation (100ms per character)
      const typingDelay = isDeleting ? 50 : 100
      if (currentTime - lastUpdateRef.current < typingDelay) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // Check if we should pause (after completing a word)
      if (currentTime < pauseUntilRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      lastUpdateRef.current = currentTime
      const currentWord = words[currentIndex]
      
      if (isDeleting) {
        // Untyping animation
        if (displayedText.length > 0) {
          setDisplayedText(currentWord.substring(0, displayedText.length - 1))
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          // Move to next word
          setIsDeleting(false)
          setCurrentIndex((prev) => (prev + 1) % words.length)
          animationFrameRef.current = requestAnimationFrame(animate)
        }
      } else {
        // Typing animation
        if (displayedText.length < currentWord.length) {
          setDisplayedText(currentWord.substring(0, displayedText.length + 1))
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          // Wait 2 seconds before starting to delete
          pauseUntilRef.current = currentTime + 2000
          setIsDeleting(true)
          animationFrameRef.current = requestAnimationFrame(animate)
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [displayedText, isDeleting, currentIndex, words])

  return (
    <span className="inline-block text-primary font-bold" style={{
      textShadow: '0 0 20px rgba(34, 197, 94, 0.5), 0 0 40px rgba(34, 197, 94, 0.3)',
      minWidth: '220px', // Significantly increased to prevent text wrapping
      textAlign: 'left'
    }}>
      {displayedText}
      <span className="animate-pulse">|</span>
    </span>
  )
})
AnimatedWord.displayName = 'AnimatedWord'

const ContactDialogHandler = memo(({ 
  showContactDialog, 
  setShowContactDialog 
}: { 
  showContactDialog: boolean
  setShowContactDialog: (show: boolean) => void 
}) => {
  const searchParams = useSearchParams()

  // Check for contact parameter and open dialog
  useEffect(() => {
    if (searchParams.get('contact') === 'true') {
      setShowContactDialog(true)
      // Clean up URL parameter
      const url = new URL(window.location.href)
      url.searchParams.delete('contact')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams, setShowContactDialog])

  return null
})
ContactDialogHandler.displayName = 'ContactDialogHandler'

// Memoized Feature Card Component
const FeatureCard = memo(({ 
  feature, 
  index 
}: { 
  feature: {
    icon: React.ReactNode
    title: string
    description: string
    features: string[]
  }
  index: number
}) => {
  const isAIFeature = feature.title === "AI-Powered Research Assistant"
  
  return (
    <Card className="p-6">
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-4">
          {isAIFeature ? (
            <div className="relative flex-shrink-0">
              <div className="text-purple-500 dark:text-purple-400 relative z-10">
                {feature.icon}
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-16 w-16 rounded-full bg-purple-500/40 dark:bg-purple-400/40 blur-lg animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-purple-500/30 dark:bg-purple-400/30 blur-sm animate-pulse" style={{ animationDelay: '0.5s' }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0">
              {feature.icon}
            </div>
          )}
          <h3 className="text-xl font-semibold text-foreground leading-tight">{feature.title}</h3>
        </div>
        <p className="text-muted-foreground">{feature.description}</p>
        <ul className="space-y-1">
          {feature.features.map((item, featureIndex) => (
            <li key={featureIndex} className="text-sm text-muted-foreground flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
})
FeatureCard.displayName = 'FeatureCard'

// Memoized FAQ Item Component
const FAQItem = memo(({ 
  faq, 
  index, 
  openFAQ, 
  toggleFAQ 
}: { 
  faq: { question: string; answer: string }
  index: number
  openFAQ: number | null
  toggleFAQ: (index: number) => void
}) => (
  <Card className="cursor-pointer" onClick={() => toggleFAQ(index)}>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
        <ChevronDownIcon className={`h-5 w-5 text-muted-foreground transition-transform ${openFAQ === index ? 'rotate-180' : ''}`} />
      </div>
      {openFAQ === index && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
        </div>
      )}
    </CardContent>
  </Card>
))
FAQItem.displayName = 'FAQItem'

export default function KnowledgeCaptureLanding() {
  const { user: currentUser, loading: userLoading } = useUser()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showContactDialog, setShowContactDialog] = useState(false)
  const [videoLoading, setVideoLoading] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const connectorContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!userLoading) {
      setIsAuthenticated(!!currentUser)
    }
  }, [currentUser, userLoading])

  // Redirect password reset codes to reset-password page
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    if (code) {
      router.replace(`/reset-password?code=${code}`)
    }
  }, [router])

  // Timeout to detect if video fails to load (Vimeo may show Cloudflare challenge)
  // The iframe onLoad fires even when Vimeo shows a security challenge page,
  // so we use a timeout to detect when the video isn't actually playing
  useEffect(() => {
    if (videoLoading) {
      const timeout = setTimeout(() => {
        // If still loading after 10 seconds, assume it failed
        // This catches cases where Vimeo shows a Cloudflare challenge page
        setVideoLoading(false)
        setVideoError(true)
      }, 10000)

      return () => clearTimeout(timeout)
    }
  }, [videoLoading])

  const toggleFAQ = useCallback((index: number) => {
    setOpenFAQ(prev => prev === index ? null : index)
  }, [])

  // Memoize features data
  const features = useMemo(() => [
    {
      icon: <FolderIcon className="h-16 w-16 text-primary" />,
      title: "Experimental Workflows & Integration",
      description: "Capture experimental protocols as sequential workflows with dependencies, while connecting your existing GitHub repos, cloud storage, and datasets to maintain full context of your research.",
      features: ["Visual protocol dependencies", "GitHub & cloud storage connections", "Data lineage tracking"]
    },
    {
      icon: <Sparkles className="h-16 w-16 text-purple-500 dark:text-purple-400" />,
      title: "AI-Powered Research Assistant",
      description: "Upload protocols, data files, and documentation to automatically structure experiment trees. Query your research using natural language to get insights and analysis across your complete experimental context.",
      features: ["AI file processing & extraction", "Natural language queries", "Context-aware analysis"]
    },
    {
      icon: <UserGroupIcon className="h-16 w-16 text-primary" />,
      title: "Team Collaboration & Task Management",
      description: "Personal and shared tasks, continuous meeting notes, and work logs that preserve team knowledge and maintain context across project handovers and personnel changes.",
      features: ["Personal & shared tasks", "Continuous meeting notes", "Work logs & todo lists"]
    }
  ], [])

  // Memoize FAQ data
  const faqs = useMemo(() => [
    {
      question: "How is this different from existing lab management tools?",
      answer: "Olvaro focuses specifically on preserving and organising the knowledge that gets lost in research. Unlike generic project management tools, it's designed for the unique needs of experimental workflows, with features like video transcripts, code integration and handover packages."
    },
    {
      question: "Do I need to migrate all my existing data?",
      answer: "No! Olvaro works as a lightweight wrapper around your existing tools. You can link to files in Dropbox, GitHub repos, and other storage without moving anything. It's designed to index and organize what you already have."
    },
    {
      question: "Can I control who sees my research?",
      answer: "Absolutely. Olvaro includes flexible access controls. You can set your project to public or private and decide wether you want to show your projects on your profile."
    },
    {
      question: "What happens to my data if I stop using the service?",
      answer: "Your data always remains yours. You can export everything at any time. We believe in data portability and won't lock you into our platform."
    },
    {
      question: "What new features are coming soon?",
      answer: "Features coming soon include a full suite of access controls, including ability to share and delegate access for specific team members to specific trees in a project. Also, augmented AI search to find information in experiment trees, build entirely new trees from inputting all forms of data for a project, and planning a new project or workflow using past open-source projects."
    }
  ], [])

  const handleGetStarted = () => {
    if (isAuthenticated) {
      window.location.href = "/dashboard/projects"
    } else {
      window.location.href = "/login"
    }
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactForm),
      })

      const result = await response.json()

      if (response.ok) {
        // Show success message
        alert('Message sent successfully! We\'ll get back to you soon.')
        setContactForm({ name: '', email: '', message: '' })
        setShowContactDialog(false)
      } else {
        console.error('Contact form error:', result)
        const errorMessage = result.details || result.error || 'Failed to send message. Please try again.'
        alert(`Error: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Network error:', error)
      alert('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }


  // Show loading state while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 z-0">
        <KnowledgeNodesBackground 
          className="w-full h-full" 
          interactive={true}
          animated={true}
          transitionStart="calc(100vh + 50px)"
          transitionEnd="calc(100vh + 150px)"
        />
      </div>
      
      {/* Single blur layer for maximum performance */}
      <div 
        className="absolute left-0 w-full z-5 pointer-events-none"
        style={{
          top: 'calc(100vh + 150px)', // Start much lower
          height: 'calc(100% - 100vh - 150px)', // Cover remaining height
          background: `linear-gradient(to bottom, 
            transparent 0%, 
            transparent 70%, 
            rgba(255, 255, 255, 0.02) 100%
          )`,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      />
      <Suspense fallback={null}>
        <ContactDialogHandler 
          showContactDialog={showContactDialog} 
          setShowContactDialog={setShowContactDialog} 
        />
      </Suspense>
      {/* Header - only show when not authenticated (AppHeader handles authenticated state) */}
      {!isAuthenticated && (
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky z-20 top-0">
          <div className="container mx-auto px-4 h-20 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Image
                src="/olvaro-logo.png"
                alt="Olvaro Logo"
                width={48}
                height={48}
                className="h-12 w-12"
              />
              <span className="text-2xl font-bold text-foreground">Olvaro</span>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
                FAQ
              </a>
              <a href="#labs" className="text-muted-foreground hover:text-foreground transition-colors">
                Research Projects
              </a>
              <button 
                onClick={() => setShowContactDialog(true)}
                className="text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Contact
              </button>
            </nav>
            {!userLoading && (
              <div className="flex items-center space-x-3">
                {mounted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-9 w-9 p-0 hover:!bg-muted hover:!text-foreground focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <Moon className="h-5 w-5 text-blue-400" />
                    )}
                    <span className="sr-only">Toggle theme</span>
                  </Button>
                )}
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold px-8 py-3 shadow-lg hover:shadow-xl transition-all duration-200"
                  onClick={() => (window.location.href = "/login")}
                >
                  Get Started
                </Button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Hero Section */}
      <section className="py-20 px-4 relative pb-32 z-10">
        <div className="container mx-auto max-w-7xl relative z-10">
          <div className="grid lg:grid-cols-5 gap-8 items-center">
            <div className="lg:col-span-2 space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tight text-foreground">
                  <AnimatedWord words={["Capture", "Organise", "Manage"]} /> Your Research Knowledge With Olvaro
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed p-6 rounded-lg backdrop-blur-sm bg-background/80 border border-border/50">
                  A centralised hub to ensure continuity of techniques with AI powered knowledge trees, featuring tasks (personal and shared), continuous meeting notes, and work logs
                </p>
              </div>
              <div className="flex space-x-4">
                <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
                  Get Started
                </Button>
              </div>
            </div>
            <div className="lg:col-span-3 relative">
              <div 
                className="w-full rounded-2xl overflow-hidden" 
                style={{ 
                  paddingBottom: '60%', 
                  position: 'relative',
                  backgroundColor: 'transparent',
                  overflow: 'hidden'
                }}
              >
                {videoError ? (
                  <div className="absolute top-0 left-0 w-full h-full rounded-2xl bg-muted flex items-center justify-center">
                    <div className="text-center p-8">
                      <VideoCameraIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-2">Video unavailable</p>
                      <p className="text-sm text-muted-foreground mb-2">
                        The video may have embedding restrictions or security settings preventing playback.
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Check Vimeo video settings: Privacy → Where can this be embedded? → Set to "Anywhere" or add your domain.
                      </p>
                      <Button 
                        variant="outline" 
                        onClick={() => window.open('https://vimeo.com/1135788759', '_blank')}
                      >
                        Watch on Vimeo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {videoLoading && (
                      <div className="absolute top-0 left-0 w-full h-full rounded-2xl bg-muted/80 flex items-center justify-center z-10">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                          <p className="text-sm text-muted-foreground">Loading video...</p>
                        </div>
                      </div>
                    )}
                <iframe
                      src="https://player.vimeo.com/video/1135788759?badge=0&autopause=0&player_id=0&app_id=58479"
                  className="absolute top-0 left-0 w-full h-full rounded-2xl"
                  style={{
                    border: 'none',
                        backgroundColor: 'transparent',
                        opacity: videoLoading ? 0 : 1,
                        transition: 'opacity 0.3s ease-in-out'
                  }}
                  frameBorder="0"
                      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                      onLoad={() => {
                        setVideoLoading(false)
                        setVideoError(false)
                      }}
                />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section id="crisis" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold mb-12 text-foreground text-center">The Research Knowledge Crisis</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Capture Box */}
            <Card className="p-8 text-center hover:shadow-lg transition-all duration-200">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <DocumentTextIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Capture</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-sm text-foreground font-medium">Experiments and data scattered across Dropbox, Sharepoint, and forgotten folders</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-sm text-foreground font-medium">Olvaro centralizes all experiments and data into organized knowledge trees</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Organise Box */}
            <Card className="p-8 text-center hover:shadow-lg transition-all duration-200">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <FolderIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Organise</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-sm text-foreground font-medium">Documentation missing or not presented in context, making research irreproducible</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-sm text-foreground font-medium">Olvaro links everything contextually, making your research fully reproducible</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manage Box */}
            <Card className="p-8 text-center hover:shadow-lg transition-all duration-200">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <UserGroupIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Manage</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-sm text-foreground font-medium">Tacit knowledge walks out when team members leave, causing work duplication</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-sm text-foreground font-medium">Olvaro preserves team knowledge and streamlines handovers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* The Current Landscape */}
      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold mb-12 text-foreground text-center">The Current Landscape</h2>
          
          {/* Three blocks side by side with flowing lines */}
          <div className="relative">
            <div className="grid md:grid-cols-3 gap-8 mb-0">
              {/* Cloud Storage Block */}
              <Card className="p-6 hover:shadow-lg transition-all duration-200 flex flex-col relative z-10">
                <CardContent className="space-y-4 flex-1">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                      <CloudArrowUpIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Cloud Storage</h3>
                      <p className="text-xs text-muted-foreground">Dropbox, Google Drive, OneDrive</p>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <p className="text-sm text-foreground leading-relaxed">
                      Sophisticated directories that store files but reveal no experimental dependencies or workflow relationships.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Note-Taking Tools Block */}
              <Card className="p-6 hover:shadow-lg transition-all duration-200 flex flex-col relative z-10">
                <CardContent className="space-y-4 flex-1">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                      <DocumentDuplicateIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Note-Taking Tools</h3>
                      <p className="text-xs text-muted-foreground">Notion, Obsidian, and similar</p>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <p className="text-sm text-foreground leading-relaxed">
                      Documentation disconnected from code repositories, datasets, and computational infrastructure.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* AI Assistants Block */}
              <Card className="p-6 hover:shadow-lg transition-all duration-200 flex flex-col relative z-10">
                <CardContent className="space-y-4 flex-1">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                      <Sparkles className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">AI Assistants</h3>
                      <p className="text-xs text-muted-foreground">Microsoft Copilot and similar</p>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <p className="text-sm text-foreground leading-relaxed">
                      AI that reads single files in isolation, lacking visibility into experimental workflows and dependencies.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Connector lines from blocks to Olvaro - using canvas like interactive map */}
            <div 
              ref={connectorContainerRef}
              className="relative w-full hidden md:block pointer-events-auto" 
              style={{ height: '60px', marginTop: '0.5rem', marginBottom: '0' }}
            >
              <ConnectorLines containerRef={connectorContainerRef} />
            </div>
          </div>

          {/* Olvaro Block */}
          <div className="relative z-10 mt-0">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Image
                  src="/olvaro-logo.png"
                  alt="Olvaro Logo"
                  width={120}
                  height={120}
                  className="h-32 w-32"
                />
              </div>
              <p className="text-lg text-muted-foreground">Transform your research workflow into organized, searchable knowledge</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <FeatureCard key={index} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Research Projects Discovery */}
      <section id="labs" className="py-16 px-4 relative z-10 scroll-mt-32">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Discover Researchers and Research Projects Using Olvaro</h2>
            <p className="text-lg text-muted-foreground">Explore public research projects and see how researchers are organising their work</p>
          </div>


          <div className="text-center mt-12">
            <Link href="/labs">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-bold px-12 py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 border-0"
              >
                View All Research Projects
              </Button>
            </Link>
          </div>
        </div>
      </section>
      {/* FAQ Section */}
      <section id="faq" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Frequently Asked Questions</h2>
            <p className="text-lg text-muted-foreground">Everything you need to know about Olvaro</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <FAQItem 
                key={index} 
                faq={faq} 
                index={index} 
                openFAQ={openFAQ} 
                toggleFAQ={toggleFAQ} 
              />
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">Ready to Transform Your Research?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join the growing community of researchers who are preserving and organising their knowledge.
          </p>
          <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
            Get Started
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-12 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Image
                  src="/olvaro-logo.png"
                  alt="Olvaro Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="text-lg font-semibold text-foreground">Olvaro</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Transforming research workflows into organised, searchable knowledge.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
                <li><a href="#labs" className="hover:text-foreground transition-colors">Research Projects</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><Link href="/privacy-terms" className="hover:text-foreground transition-colors">Privacy & Terms</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Support</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button 
                    onClick={() => setShowContactDialog(true)}
                    className="hover:text-foreground transition-colors text-left"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 Olvaro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Contact Us</DialogTitle>
            <DialogDescription>
              Send us a message and we'll get back to you as soon as possible.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                required
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                required
                placeholder="your.email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                required
                placeholder="How can we help you?"
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowContactDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}
