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
  ArrowTopRightOnSquareIcon,
  ArrowDownIcon,
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
          // Wait 1 second before starting to delete
          pauseUntilRef.current = currentTime + 1000
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
    image?: string
  }
  index: number
}) => {
  const isAIFeature = feature.title === "AI-Powered Research Assistant"
  
  return (
    <Card className="p-6 h-full flex flex-col">
      <CardContent className="flex flex-col flex-1">
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
        <ul className="space-y-4 !mt-10 !mb-10">
          {feature.features.map((item, featureIndex) => (
            <li key={featureIndex} className="text-base text-foreground flex items-start space-x-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></div>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {feature.image && (
          <div className="mt-auto -mx-6 -mb-6">
            <div className="relative w-full border border-white dark:border-gray-800" style={{ aspectRatio: 'auto' }}>
              <Image
                src={feature.image}
                alt={feature.title}
                width={800}
                height={600}
                className="w-full h-auto object-contain"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
          </div>
        )}
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
    <CardContent className="py-3 px-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
        <ChevronDownIcon className={`h-5 w-5 text-muted-foreground transition-transform ${openFAQ === index ? 'rotate-180' : ''}`} />
      </div>
      {openFAQ === index && (
        <div className="mt-3 pt-3 border-t border-border">
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

  // Redirect password reset codes to reset-password page (but not email verification codes)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const type = urlParams.get('type')
    // Only redirect password recovery codes, not email verification codes
    if (code && type === 'recovery') {
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
      description: "",
      features: [
        "Capture protocols as sequential workflows with visual dependencies and track data lineage for reproducibility",
        "Connect GitHub, cloud storage, and datasets without replacing your existing tools"
      ],
      image: "/sc_tree.jpeg"
    },
    {
      icon: <Sparkles className="h-16 w-16 text-purple-500 dark:text-purple-400" />,
      title: "AI-Powered Research Assistant",
      description: "",
      features: [
        "Upload files to automatically structure experiment trees using AI and get context-aware analysis",
        "Query research using natural language for insights across your experimental context"
      ],
      image: "/sc_chat.jpeg"
    },
    {
      icon: <UserGroupIcon className="h-16 w-16 text-primary" />,
      title: "Team Collaboration & Task Management",
      description: "",
      features: [
        "Manage personal and shared tasks connected to workflows and maintain meeting notes that preserve team knowledge",
        "Track work logs and todo lists across handovers and personnel changes"
      ],
      image: "/sc_task.jpeg"
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
      answer: "Absolutely. Olvaro includes flexible access controls. You can set your project to public or private and decide whether you want to show your projects on your profile."
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
              <a href="#team" className="text-muted-foreground hover:text-foreground transition-colors">
                Team
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
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="space-y-4 text-center">
              <h1 className="text-5xl font-bold tracking-tight text-foreground">
                <AnimatedWord words={["Capture", "Organise", "Manage"]} /> Your Research Knowledge With Olvaro
              </h1>
              <div className="flex items-center justify-center gap-2">
                <a href="https://www.ucl.ac.uk/enterprise/" target="_blank" rel="noopener noreferrer" className="inline-block">
                  <Badge variant="outline" className="text-sm font-normal border-amber-400/50 cursor-pointer hover:border-amber-400 transition-colors backdrop-blur-sm bg-background/80">
                    <span className="bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 bg-clip-text text-transparent font-semibold drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                      Prize Winner of the UCL BaseKX Explore Competition (2025)
                    </span>
                  </Badge>
                </a>
              </div>
              <p className="text-xl text-muted-foreground leading-relaxed p-6 rounded-lg backdrop-blur-sm bg-background/80 border border-border/50">
                A centralised hub to ensure continuity of techniques with AI powered experiment trees, featuring tasks (personal and shared), continuous meeting notes, and work logs
              </p>
            </div>
            <div className="flex justify-center space-x-4">
              <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
                Get Started
              </Button>
            </div>
            
            {/* Demo Video */}
            <div className="mt-12 relative">
              <div 
                className="w-full rounded-2xl overflow-hidden" 
                style={{ 
                  paddingBottom: '56.25%', 
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
            <Card className="p-8 text-center">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <DocumentTextIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Capture</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-base text-foreground font-medium">Experiment data scattered across Dropbox, Whatsapp, and forgotten folders</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-base text-foreground font-medium">Olvaro centralises data into structured experiment trees</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Organise Box */}
            <Card className="p-8 text-center">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <FolderIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Organise</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-base text-foreground font-medium">Documentation missing or not held in context, so research is irreproducible</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-base text-foreground font-medium">Olvaro links everything contextually, making your research fully reproducible</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manage Box */}
            <Card className="p-8 text-center">
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <UserGroupIcon className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Manage</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-red-400 dark:bg-red-900/20 rounded-lg border-l-4 border-red-800 dark:border-red-500">
                    <p className="text-base text-foreground font-medium">Tacit knowledge walks out when team members leave, causing work duplication</p>
                  </div>
                  <div className="p-4 bg-green-400 dark:bg-green-900/20 rounded-lg border-l-4 border-green-800 dark:border-green-500">
                    <p className="text-base text-foreground font-medium">Olvaro preserves team knowledge and streamlines handovers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FAIR Principles Impact */}
          <div className="mt-16">
            <div className="text-center mb-8">
              <a
                href="https://www.go-fair.org/fair-principles/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-2xl font-bold text-foreground hover:text-primary transition-colors"
              >
                <h3>The FAIR Principles Gap</h3>
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
              </a>
            </div>
            
            <div className="space-y-6 mt-8 max-w-5xl mx-auto">
              {/* Findable */}
              <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center">
                <div className="text-center" style={{ minWidth: '100px' }}>
                  <span className="text-3xl font-bold text-foreground">F</span>
                  <span className="text-base text-foreground">indable</span>
                </div>
                <div className="text-center w-8">
                  <ArrowRightIcon className="h-6 w-6 text-muted-foreground mx-auto" />
                </div>
                <div>
                  <p className="text-base text-muted-foreground whitespace-nowrap">
                    Scattered data across multiple platforms makes experiments impossible to locate
                  </p>
                </div>
              </div>

              {/* Accessible */}
              <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center">
                <div className="text-center" style={{ minWidth: '100px' }}>
                  <span className="text-3xl font-bold text-foreground">A</span>
                  <span className="text-base text-foreground">ccessible</span>
                </div>
                <div className="text-center w-8">
                  <ArrowRightIcon className="h-6 w-6 text-muted-foreground mx-auto" />
                </div>
                <div>
                  <p className="text-base text-muted-foreground whitespace-nowrap">
                    When team members leave, access to critical knowledge is lost, breaking the chain of scientific continuity
                  </p>
                </div>
              </div>

              {/* Interoperable */}
              <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center">
                <div className="text-center" style={{ minWidth: '100px' }}>
                  <span className="text-3xl font-bold text-foreground">I</span>
                  <span className="text-base text-foreground">nteroperable</span>
                </div>
                <div className="text-center w-8">
                  <ArrowRightIcon className="h-6 w-6 text-muted-foreground mx-auto" />
                </div>
                <div>
                  <p className="text-base text-muted-foreground whitespace-nowrap">
                    Disconnected documentation and isolated files prevent integration across tools and platforms, blocking collaborative workflows
                  </p>
                </div>
              </div>

              {/* Reusable */}
              <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center">
                <div className="text-center" style={{ minWidth: '100px' }}>
                  <span className="text-3xl font-bold text-foreground">R</span>
                  <span className="text-base text-foreground">eusable</span>
                </div>
                <div className="text-center w-8">
                  <ArrowRightIcon className="h-6 w-6 text-muted-foreground mx-auto" />
                </div>
                <div>
                  <p className="text-base text-muted-foreground whitespace-nowrap">
                    Missing context and broken dependencies render research irreproducible, preventing others from building upon your work
                  </p>
                </div>
              </div>
            </div>
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
              <Card className="p-6 flex flex-col relative z-10">
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
                    <p className="text-base text-foreground leading-relaxed">
                      Sophisticated directories store files but reveal no experimental dependencies or relationships.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* AI Assistants Block */}
              <Card className="p-6 flex flex-col relative z-10">
                <CardContent className="space-y-4 flex-1">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                      <Sparkles className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">AI Assistants</h3>
                      <p className="text-xs text-muted-foreground">Microsoft Copilot, ChatGPT</p>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <p className="text-base text-foreground leading-relaxed">
                      AI reads single files in isolation, lacking visibility into experimental workflows/dependencies.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Note-Taking Tools Block */}
              <Card className="p-6 flex flex-col relative z-10">
                <CardContent className="space-y-4 flex-1">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                      <DocumentDuplicateIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Note-Taking Tools</h3>
                      <p className="text-xs text-muted-foreground">Notion, Slack, Whatsapp</p>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <p className="text-base text-foreground leading-relaxed">
                      Documentation and critical details disconnected from documentation repositories.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Vertical arrows from each box */}
            <div className="grid md:grid-cols-3 gap-8 mt-20 mb-20">
              <div className="flex justify-center">
                <ArrowDownIcon className="h-20 w-20 text-muted-foreground" />
              </div>
              <div className="flex justify-center">
                <ArrowDownIcon className="h-20 w-20 text-muted-foreground" />
              </div>
              <div className="flex justify-center">
                <ArrowDownIcon className="h-20 w-20 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Olvaro Block */}
          <div id="features" className="relative z-10">
            <div className="text-center mb-8">
              <p className="text-lg text-muted-foreground">Transform your research workflow into organised, searchable knowledge</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <FeatureCard key={index} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Meet the Team Section */}
      <section id="team" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Meet the Team Behind Olvaro</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Team Member 1 */}
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-40 h-40 mb-4 rounded-full overflow-hidden bg-muted border-4 border-border">
                    <Image
                      src="/noah.jpg"
                      alt="Noah Chander"
                      width={160}
                      height={160}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <a
                    href="https://www.linkedin.com/in/noah-chander-014b52250/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 flex items-center justify-center gap-2 text-xl font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    <h3>Noah Chander</h3>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                  <ul className="text-left space-y-2 text-muted-foreground">
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>Software Development Engineer, <span className="font-bold text-foreground">Amazon Prime Video</span></span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>BEng Mechanical Engineering, <span className="font-bold text-foreground">University College London</span></span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Team Member 2 */}
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-40 h-40 mb-4 rounded-full overflow-hidden bg-muted border-4 border-border">
                    <Image
                      src="/jude.jpg"
                      alt="Jude Popham"
                      width={160}
                      height={160}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <a
                    href="https://www.linkedin.com/in/jude-popham/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 flex items-center justify-center gap-2 text-xl font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    <h3>Jude Popham</h3>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                  <ul className="text-left space-y-2 text-muted-foreground">
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>ML for genetic regulation DPhil, <span className="font-bold text-foreground">University of Oxford</span> (current)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>MRes Bioinformatics, <span className="font-bold text-foreground">Imperial College London</span></span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>BSc Biochemistry, <span className="font-bold text-foreground">King's College London</span></span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Frequently Asked Questions</h2>
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
