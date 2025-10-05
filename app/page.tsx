"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { useState, useEffect } from "react"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth-service"

export default function KnowledgeCaptureLanding() {
  const [showContactForm, setShowContactForm] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    university: '',
    department: '',
    researchTopic: '',
    labSize: '',
    grantFunder: '',
    currentTools: '',
    demoFocus: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser()
        setIsAuthenticated(!!user)
      } catch (error) {
        setIsAuthenticated(false)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index)
  }

  const handleSeeInAction = () => {
    if (isAuthenticated) {
      window.location.href = "/dashboard"
    } else {
      window.location.href = "/login"
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitMessage('')

    // Debug: Log what we're sending
    console.log('Submitting form data:', formData)

    try {
      const response = await fetch('/api/send-demo-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        setSubmitMessage('Demo request sent successfully! We\'ll be in touch soon.')
        setFormData({
          name: '',
          title: '',
          email: '',
          university: '',
          department: '',
          researchTopic: '',
          labSize: '',
          grantFunder: '',
          currentTools: '',
          demoFocus: ''
        })
        setTimeout(() => {
          setShowContactForm(false)
          setSubmitMessage('')
        }, 3000)
      } else {
        const errorData = await response.json()
        console.error('API Error:', errorData)
        setSubmitMessage(`Failed to send request: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error:', error)
      setSubmitMessage('Failed to send request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BeakerIcon className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Knowledge Capture</span>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
            <a href="#labs" className="text-muted-foreground hover:text-foreground transition-colors">
              Research Labs
            </a>
            <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </a>
          </nav>
          {!loading && !isAuthenticated && (
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold px-8 py-3 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => (window.location.href = "/login")}
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tight text-foreground">
                  Capture & Organize Your Research Knowledge
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Transform scattered experiments into organized knowledge trees. Preserve tacit knowledge, streamline handovers, and make your research reproducible.
                </p>
              </div>
              <div className="flex space-x-4">
                <Button size="lg" className="text-lg px-8 py-6" onClick={() => setShowContactForm(true)}>
                  Book a Free Demo
                </Button>
                <Button size="lg" variant="outline" className="text-lg px-8 py-6" onClick={handleSeeInAction}>
                  See It In Action
                </Button>
              </div>
            </div>
            <div className="relative">
              <Card className="shadow-2xl">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 rounded-lg">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <BeakerIcon className="h-6 w-6 text-primary" />
                        <span className="font-semibold">Protein Expression Protocol</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 text-sm">
                          <PlayIcon className="h-4 w-4 text-green-600" />
                          <span>1. Plasmid Preparation</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <PlayIcon className="h-4 w-4 text-green-600" />
                          <span>2. Cell Culture Setup</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <PlayIcon className="h-4 w-4 text-blue-600" />
                          <span>3. Protein Expression</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <PlayIcon className="h-4 w-4 text-blue-600" />
                          <span>4. Cell Lysis</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <PlayIcon className="h-4 w-4 text-orange-600" />
                          <span>5. Protein Analysis</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <VideoCameraIcon className="h-3 w-3" />
                          <span>3 videos</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <CodeBracketIcon className="h-3 w-3" />
                          <span>2 repos</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <CircleStackIcon className="h-3 w-3" />
                          <span>1 dataset</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Research Labs Discovery */}
      <section id="labs" className="py-16 px-4 bg-muted/10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Discover Research Labs</h2>
            <p className="text-lg text-muted-foreground">See who's already organizing their research with Knowledge Capture</p>
          </div>

          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input placeholder="Search labs, universities, or research areas..." className="pl-12 h-12 text-base" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: "Bioengineering Lab",
                university: "Stanford University",
                members: 12,
                field: "Synthetic Biology",
                projects: ["Protein Expression", "Cell Culture", "Data Analysis"],
                avatar: "BL",
                trees: 8,
              },
              {
                name: "Computational Biology Group",
                university: "MIT",
                members: 15,
                field: "Bioinformatics",
                projects: ["RNA-seq Analysis", "Protein Structure", "GWAS Pipeline"],
                avatar: "CB",
                trees: 12,
              },
              {
                name: "Materials Science Lab",
                university: "University of Cambridge",
                members: 8,
                field: "Materials Engineering",
                projects: ["Nanomaterials", "Battery Research", "Solar Cells"],
                avatar: "MS",
                trees: 6,
              },
              {
                name: "Quantum Computing Lab",
                university: "University of Oxford",
                members: 6,
                field: "Quantum Physics",
                projects: ["Quantum Algorithms", "Error Correction", "Hardware Design"],
                avatar: "QC",
                trees: 4,
              },
              {
                name: "Climate Modeling Group",
                university: "Imperial College London",
                members: 10,
                field: "Environmental Science",
                projects: ["Climate Simulations", "Weather Prediction", "Ocean Models"],
                avatar: "CM",
                trees: 7,
              },
              {
                name: "Genomics Research Lab",
                university: "Harvard University",
                members: 18,
                field: "Genetics",
                projects: ["Genome Assembly", "Variant Analysis", "Population Genetics"],
                avatar: "GR",
                trees: 15,
              },
            ].map((lab, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                          {lab.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {lab.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">{lab.university}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {lab.field}
                    </Badge>
                  </div>

                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <UserGroupIcon className="h-4 w-4" />
                      <span>{lab.members} members</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FolderIcon className="h-4 w-4" />
                      <span>{lab.trees} trees</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Recent Projects:</p>
                    <div className="flex flex-wrap gap-1">
                      {lab.projects.slice(0, 2).map((project, projectIndex) => (
                        <Badge key={projectIndex} variant="outline" className="text-xs">
                          {project}
                        </Badge>
                      ))}
                      {lab.projects.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{lab.projects.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/labs">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold px-12 py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 border-0"
              >
                🔬 View All Research Labs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-12 text-foreground">The Research Knowledge Crisis</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              "Code scattered across laptops & Dropbox",
              "Documentation missing or unreadable",
              "Videos lost in forgotten folders",
              "Knowledge walks out the door",
            ].map((problem, index) => (
              <Card key={index} className="p-6 text-center">
                <CardContent>
                  <p className="text-sm text-muted-foreground">{problem}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4">
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
                description: "Organize your research as sequential workflows. Each node represents a step, protocol, or result.",
                features: ["Visual experiment flow", "Step-by-step navigation", "Nested sub-procedures"]
              },
              {
                icon: <VideoCameraIcon className="h-8 w-8 text-primary" />,
                title: "Video + Transcripts",
                description: "Capture tacit knowledge with videos and searchable transcripts. Never lose the 'how' again.",
                features: ["Auto-generated transcripts", "Chapter markers", "Searchable content"]
              },
              {
                icon: <CodeBracketIcon className="h-8 w-8 text-primary" />,
                title: "Code Integration",
                description: "Link GitHub repos, track code quality, and maintain analysis pipelines in context.",
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
                description: "Generate comprehensive handover documents with all context, files, and knowledge.",
                features: ["Automated reports", "Complete context", "Easy sharing"]
              },
              {
                icon: <MagnifyingGlassIcon className="h-8 w-8 text-primary" />,
                title: "Smart Search",
                description: "Find anything instantly with full-text search across videos, code, data, and documentation.",
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
      <section id="faq" className="py-16 px-4 bg-muted/10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Frequently Asked Questions</h2>
            <p className="text-lg text-muted-foreground">Everything you need to know about Knowledge Capture</p>
          </div>

          <div className="space-y-4">
            {[
              {
                question: "How is this different from existing lab management tools?",
                answer: "Knowledge Capture focuses specifically on preserving and organizing the tacit knowledge that gets lost in research. Unlike generic project management tools, it's designed for the unique needs of experimental workflows, with features like video transcripts, code integration, and automated handover packages."
              },
              {
                question: "Do I need to migrate all my existing data?",
                answer: "No! Knowledge Capture works as a lightweight wrapper around your existing tools. You can link to files in Dropbox, GitHub repos, and other storage without moving anything. It's designed to index and organize what you already have."
              },
              {
                question: "How does the video transcription work?",
                answer: "We integrate with Whisper AI to automatically generate searchable transcripts from your lab videos. The system can also create chapter markers and extract key information, making your video content as searchable as text documents."
              },
              {
                question: "Can I control who sees my research?",
                answer: "Absolutely. Knowledge Capture includes flexible access controls. You can set permissions at the project level, share specific experiment trees with collaborators, or keep everything private to your lab."
              },
              {
                question: "What happens to my data if I stop using the service?",
                answer: "Your data always remains yours. You can export everything at any time, including the organized structure, metadata, and all linked files. We believe in data portability and won't lock you into our platform."
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
      <section id="contact" className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">Ready to Transform Your Research?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join the growing community of researchers who are preserving and organizing their knowledge.
          </p>
          <Button size="lg" className="text-lg px-8 py-6" onClick={() => setShowContactForm(true)}>
            Book a Free Demo
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <BeakerIcon className="h-6 w-6 text-primary" />
                <span className="text-lg font-semibold text-foreground">Knowledge Capture</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Transforming research workflows into organized, searchable knowledge.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
                <li><a href="#labs" className="hover:text-foreground transition-colors">Research Labs</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Support</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#contact" className="hover:text-foreground transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Help Center</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center">
            <p className="text-sm text-muted-foreground">
              © 2024 Knowledge Capture. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Contact Form Modal */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Book a Free Demo</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowContactForm(false)}>
                  ×
                </Button>
              </div>
              <CardDescription>
                Tell us about your research and we'll show you how Knowledge Capture can help.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="university">University/Institution *</Label>
                    <Input
                      id="university"
                      value={formData.university}
                      onChange={(e) => setFormData({...formData, university: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department *</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="researchTopic">Research Topic/Area *</Label>
                  <Input
                    id="researchTopic"
                    value={formData.researchTopic}
                    onChange={(e) => setFormData({...formData, researchTopic: e.target.value})}
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="labSize">Lab Size</Label>
                    <Input
                      id="labSize"
                      value={formData.labSize}
                      onChange={(e) => setFormData({...formData, labSize: e.target.value})}
                      placeholder="e.g., 5-10 people"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grantFunder">Grant Funder</Label>
                    <Input
                      id="grantFunder"
                      value={formData.grantFunder}
                      onChange={(e) => setFormData({...formData, grantFunder: e.target.value})}
                      placeholder="e.g., NSF, NIH, Wellcome Trust"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currentTools">Current Tools/Systems</Label>
                  <Textarea
                    id="currentTools"
                    value={formData.currentTools}
                    onChange={(e) => setFormData({...formData, currentTools: e.target.value})}
                    placeholder="What tools do you currently use for lab management, data storage, etc.?"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="demoFocus">Demo Focus Areas</Label>
                  <Textarea
                    id="demoFocus"
                    value={formData.demoFocus}
                    onChange={(e) => setFormData({...formData, demoFocus: e.target.value})}
                    placeholder="What aspects of Knowledge Capture are you most interested in seeing?"
                    rows={3}
                  />
                </div>

                {submitMessage && (
                  <div className={`p-4 rounded-md ${submitMessage.includes('successfully') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {submitMessage}
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? 'Sending...' : 'Send Demo Request'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowContactForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
