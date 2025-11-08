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
} from "@heroicons/react/24/outline"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useUser } from "@/lib/user-context"
import { KnowledgeNodesBackground } from "@/components/KnowledgeNodesBackground"
import Image from "next/image"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"

// Animated Word Component
const AnimatedWord = ({ words }: { words: string[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(true)
  const [displayedText, setDisplayedText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[currentIndex]
    
    if (isDeleting) {
      // Untyping animation
      if (displayedText.length > 0) {
        const timeout = setTimeout(() => {
          setDisplayedText(currentWord.substring(0, displayedText.length - 1))
        }, 50)
        return () => clearTimeout(timeout)
      } else {
        // Move to next word
        setIsDeleting(false)
        setCurrentIndex((prev) => (prev + 1) % words.length)
      }
    } else {
      // Typing animation
      if (displayedText.length < currentWord.length) {
        const timeout = setTimeout(() => {
          setDisplayedText(currentWord.substring(0, displayedText.length + 1))
        }, 100)
        return () => clearTimeout(timeout)
      } else {
        // Wait 2 seconds before starting to delete
        const timeout = setTimeout(() => {
          setIsDeleting(true)
        }, 2000)
        return () => clearTimeout(timeout)
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
}

function ContactDialogHandler({ 
  showContactDialog, 
  setShowContactDialog 
}: { 
  showContactDialog: boolean
  setShowContactDialog: (show: boolean) => void 
}) {
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
}

export default function KnowledgeCaptureLanding() {
  const { user: currentUser, loading: userLoading } = useUser()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showContactDialog, setShowContactDialog] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index)
  }

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
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tight text-foreground">
                  <AnimatedWord words={["Capture", "Organise", "Manage"]} /> Your Research Knowledge With Olvaro
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed p-6 rounded-lg backdrop-blur-sm bg-background/80 border border-border/50">
                  Transform scattered research into organized knowledge trees. Make your work reproducible and preserve team knowledge.
                </p>
              </div>
              <div className="flex space-x-4">
                <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
                  Get Started
                </Button>
              </div>
            </div>
            <div className="relative">
              <Card className="shadow-2xl border-2 border-gray-200 overflow-hidden">
                <CardContent className="p-0">
                  <img 
                    src="/rna-seq-pipeline-demo.png" 
                    alt="RNA-seq Analysis Pipeline - Knowledge Capture Interface"
                    className="w-full h-auto"
                  />
                </CardContent>
              </Card>
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
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">Problem</p>
                    <p className="text-sm text-red-600 dark:text-red-400">Experiments and data scattered across Dropbox, Sharepoint, and forgotten folders</p>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">Solution</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Olvaro centralizes all experiments and data into organized knowledge trees</p>
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
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">Problem</p>
                    <p className="text-sm text-red-600 dark:text-red-400">Documentation missing or not presented in context, making research irreproducible</p>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">Solution</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Olvaro links everything contextually, making your research fully reproducible</p>
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
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">Problem</p>
                    <p className="text-sm text-red-600 dark:text-red-400">Tacit knowledge walks out when team members leave, causing work duplication</p>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">Solution</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Olvaro preserves team knowledge and streamlines handovers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Research Projects Discovery */}
      <section id="labs" className="py-16 px-4 bg-muted/10 relative z-10 scroll-mt-32">
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
                🔬 View All Research Projects
              </Button>
            </Link>
          </div>
        </div>
      </section>


      {/* Features */}
      <section id="features" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">How Knowledge Capture Works</h2>
            <p className="text-lg text-muted-foreground">Transform your research workflow into organized, searchable knowledge</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <FolderIcon className="h-8 w-8 text-primary" />,
                title: "Ordered Experiment Trees",
                description: "Organise your research as sequential workflows. Build sequential blocks consisting of sequential nodes with attached data.",
                features: ["Visual experiment flow", "Nested sub-procedures", "Drag and drop reordering"]
              },
              {
                icon: <VideoCameraIcon className="h-8 w-8 text-primary" />,
                title: "Video + Transcripts",
                description: "Capture tacit knowledge and instructional details with videos and searchable transcripts. Never lose the 'how' again.",
                features: ["Auto-generated transcripts", "Embedded video", "Searchable content"]
              },
              {
                icon: <CodeBracketIcon className="h-8 w-8 text-primary" />,
                title: "Code Integration",
                description: "Link GitHub repos, track code quality changes, and maintain analysis pipelines in context.",
                features: ["GitHub integration", "Code quality checks", "Analysis pipelines"]
              },
              {
                icon: <CircleStackIcon className="h-8 w-8 text-primary" />,
                title: "Data Management",
                description: "Connect datasets, track versions, and maintain data lineage throughout your experiments.",
                features: ["Data versioning", "File organization", "Metadata tracking"]
              },
              {
                icon: <ShareIcon className="h-8 w-8 text-primary" />,
                title: "Handover Packages",
                description: "Generate comprehensive handover documents with all context, files, and knowledge in the same place.",
                features: ["Specialised reports", "Complete context", "Easy sharing"]
              },
              {
                icon: <MagnifyingGlassIcon className="h-8 w-8 text-primary" />,
                title: "Smart Search",
                description: "Find anything in an experiment tree with full-text search across videos, documentation and more.",
                features: ["Cross-content search", "Semantic understanding", "Quick discovery"]
              }
            ].map((feature, index) => (
              <Card key={index} className="p-6">
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    {feature.icon}
                    <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
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
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 px-4 bg-muted/10 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Frequently Asked Questions</h2>
            <p className="text-lg text-muted-foreground">Everything you need to know about Olvaro</p>
          </div>

          <div className="space-y-4">
            {[
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
            ].map((faq, index) => (
              <Card key={index} className="cursor-pointer" onClick={() => toggleFAQ(index)}>
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
