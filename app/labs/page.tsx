"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  BeakerIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  FolderIcon,
  FunnelIcon,
  ArrowLeftIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  TagIcon,
} from "@heroicons/react/24/outline"
import { useState, useMemo } from "react"
import Link from "next/link"

interface ResearchLab {
  id: string
  name: string
  university: string
  country: string
  members: number
  field: string
  topics: string[]
  projects: string[]
  avatar: string
  trees: number
  description: string
  website?: string
  established: string
  funding: string[]
  publications: number
  lastActivity: string
  researchers: Array<{
    id: string
    name: string
    title: string
    avatar: string
  }>
}

const mockLabs: ResearchLab[] = [
  {
    id: "lab-1",
    name: "Bioengineering Lab",
    university: "Stanford University",
    country: "USA",
    members: 12,
    field: "Synthetic Biology",
    topics: ["Protein Engineering", "Cell Biology", "Biomaterials"],
    projects: ["Protein Expression", "Cell Culture", "Data Analysis"],
    avatar: "BL",
    trees: 8,
    description: "Advancing synthetic biology through innovative protein engineering and cellular systems design.",
    website: "https://bioeng.stanford.edu",
    established: "2018",
    funding: ["NSF", "NIH", "DARPA"],
    publications: 45,
    lastActivity: "2024-01-20",
    researchers: [
      { id: "researcher-1", name: "Dr. Sarah Chen", title: "Senior Research Scientist", avatar: "SC" },
      { id: "researcher-2", name: "Dr. Michael Rodriguez", title: "Postdoctoral Fellow", avatar: "MR" },
      { id: "researcher-3", name: "Dr. Lisa Wang", title: "Research Associate", avatar: "LW" }
    ]
  },
  {
    id: "lab-2",
    name: "Computational Biology Group",
    university: "MIT",
    country: "USA",
    members: 15,
    field: "Bioinformatics",
    topics: ["Machine Learning", "Genomics", "Systems Biology"],
    projects: ["RNA-seq Analysis", "Protein Structure", "GWAS Pipeline"],
    avatar: "CB",
    trees: 12,
    description: "Developing computational methods for understanding biological systems and disease mechanisms.",
    website: "https://compbio.mit.edu",
    established: "2015",
    funding: ["NIH", "NSF", "Wellcome Trust"],
    publications: 78,
    lastActivity: "2024-01-19",
    researchers: [
      { id: "researcher-4", name: "Dr. David Kim", title: "Principal Investigator", avatar: "DK" },
      { id: "researcher-5", name: "Dr. Emma Thompson", title: "Research Scientist", avatar: "ET" },
      { id: "researcher-6", name: "Dr. James Wilson", title: "Postdoctoral Fellow", avatar: "JW" }
    ]
  },
  {
    id: "lab-3",
    name: "Materials Science Lab",
    university: "University of Cambridge",
    country: "UK",
    members: 8,
    field: "Materials Engineering",
    topics: ["Nanomaterials", "Energy Storage", "Photovoltaics"],
    projects: ["Nanomaterials", "Battery Research", "Solar Cells"],
    avatar: "MS",
    trees: 6,
    description: "Researching next-generation materials for sustainable energy and advanced manufacturing.",
    website: "https://materials.cam.ac.uk",
    established: "2012",
    funding: ["EPSRC", "EU Horizon", "Industry"],
    publications: 32,
    lastActivity: "2024-01-18",
    researchers: [
      { id: "researcher-7", name: "Dr. Maria Garcia", title: "Senior Lecturer", avatar: "MG" },
      { id: "researcher-8", name: "Dr. Alex Chen", title: "Research Fellow", avatar: "AC" }
    ]
  },
  {
    id: "lab-4",
    name: "Quantum Computing Lab",
    university: "University of Oxford",
    country: "UK",
    members: 6,
    field: "Quantum Physics",
    topics: ["Quantum Algorithms", "Quantum Error Correction", "Quantum Hardware"],
    projects: ["Quantum Algorithms", "Error Correction", "Hardware Design"],
    avatar: "QC",
    trees: 4,
    description: "Pioneering quantum computing technologies and algorithms for practical applications.",
    website: "https://quantum.ox.ac.uk",
    established: "2019",
    funding: ["EPSRC", "UKRI", "Industry"],
    publications: 28,
    lastActivity: "2024-01-17",
    researchers: [
      { id: "researcher-9", name: "Dr. Robert Smith", title: "Professor", avatar: "RS" },
      { id: "researcher-10", name: "Dr. Anna Johnson", title: "Research Scientist", avatar: "AJ" }
    ]
  },
  {
    id: "lab-5",
    name: "Climate Modeling Group",
    university: "Imperial College London",
    country: "UK",
    members: 10,
    field: "Environmental Science",
    topics: ["Climate Science", "Atmospheric Physics", "Oceanography"],
    projects: ["Climate Simulations", "Weather Prediction", "Ocean Models"],
    avatar: "CM",
    trees: 7,
    description: "Advancing climate science through high-resolution modeling and data analysis.",
    website: "https://climate.imperial.ac.uk",
    established: "2016",
    funding: ["NERC", "EU Horizon", "Met Office"],
    publications: 56,
    lastActivity: "2024-01-16",
    researchers: [
      { id: "researcher-11", name: "Dr. Thomas Brown", title: "Senior Lecturer", avatar: "TB" },
      { id: "researcher-12", name: "Dr. Sophie Davis", title: "Research Associate", avatar: "SD" }
    ]
  },
  {
    id: "lab-6",
    name: "Genomics Research Lab",
    university: "Harvard University",
    country: "USA",
    members: 18,
    field: "Genetics",
    topics: ["Population Genetics", "Evolutionary Biology", "Medical Genomics"],
    projects: ["Genome Assembly", "Variant Analysis", "Population Genetics"],
    avatar: "GR",
    trees: 15,
    description: "Exploring the genetic basis of human diversity and disease through large-scale genomic studies.",
    website: "https://genomics.harvard.edu",
    established: "2014",
    funding: ["NIH", "NSF", "Private Foundation"],
    publications: 92,
    lastActivity: "2024-01-15",
    researchers: [
      { id: "researcher-13", name: "Dr. Jennifer Lee", title: "Professor", avatar: "JL" },
      { id: "researcher-14", name: "Dr. Mark Taylor", title: "Research Scientist", avatar: "MT" },
      { id: "researcher-15", name: "Dr. Rachel Green", title: "Postdoctoral Fellow", avatar: "RG" }
    ]
  },
  {
    id: "lab-7",
    name: "Neuroscience Lab",
    university: "ETH Zurich",
    country: "Switzerland",
    members: 14,
    field: "Neuroscience",
    topics: ["Brain Imaging", "Neural Networks", "Cognitive Science"],
    projects: ["fMRI Analysis", "Neural Modeling", "Behavioral Studies"],
    avatar: "NL",
    trees: 9,
    description: "Understanding brain function through advanced imaging and computational neuroscience.",
    website: "https://neuro.ethz.ch",
    established: "2017",
    funding: ["SNF", "EU Horizon", "Industry"],
    publications: 41,
    lastActivity: "2024-01-14",
    researchers: [
      { id: "researcher-16", name: "Dr. Klaus Mueller", title: "Professor", avatar: "KM" },
      { id: "researcher-17", name: "Dr. Elena Petrov", title: "Research Scientist", avatar: "EP" }
    ]
  },
  {
    id: "lab-8",
    name: "Robotics Research Group",
    university: "Carnegie Mellon University",
    country: "USA",
    members: 20,
    field: "Robotics",
    topics: ["Autonomous Systems", "Human-Robot Interaction", "Machine Learning"],
    projects: ["Autonomous Vehicles", "Robotic Surgery", "AI Systems"],
    avatar: "RR",
    trees: 11,
    description: "Developing intelligent robotic systems for healthcare, transportation, and manufacturing.",
    website: "https://robotics.cmu.edu",
    established: "2013",
    funding: ["NSF", "DARPA", "Industry"],
    publications: 67,
    lastActivity: "2024-01-13",
    researchers: [
      { id: "researcher-18", name: "Dr. Kevin Park", title: "Professor", avatar: "KP" },
      { id: "researcher-19", name: "Dr. Nicole White", title: "Research Scientist", avatar: "NW" },
      { id: "researcher-20", name: "Dr. Carlos Martinez", title: "Postdoctoral Fellow", avatar: "CM" }
    ]
  }
]

export default function ResearchLabsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedField, setSelectedField] = useState("all")
  const [selectedCountry, setSelectedCountry] = useState("all")
  const [selectedUniversity, setSelectedUniversity] = useState("all")
  const [sortBy, setSortBy] = useState("recent")

  // Get unique values for filters
  const fields = useMemo(() => {
    const uniqueFields = Array.from(new Set(mockLabs.map(lab => lab.field)))
    return uniqueFields.sort()
  }, [])

  const countries = useMemo(() => {
    const uniqueCountries = Array.from(new Set(mockLabs.map(lab => lab.country)))
    return uniqueCountries.sort()
  }, [])

  const universities = useMemo(() => {
    const uniqueUniversities = Array.from(new Set(mockLabs.map(lab => lab.university)))
    return uniqueUniversities.sort()
  }, [])

  // Filter and sort labs
  const filteredLabs = useMemo(() => {
    let filtered = mockLabs.filter(lab => {
      const matchesSearch = 
        lab.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lab.university.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lab.field.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lab.topics.some(topic => topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
        lab.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lab.researchers.some(researcher => researcher.name.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesField = selectedField === "all" || lab.field === selectedField
      const matchesCountry = selectedCountry === "all" || lab.country === selectedCountry
      const matchesUniversity = selectedUniversity === "all" || lab.university === selectedUniversity

      return matchesSearch && matchesField && matchesCountry && matchesUniversity
    })

    // Sort labs
    switch (sortBy) {
      case "recent":
        filtered.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
        break
      case "members":
        filtered.sort((a, b) => b.members - a.members)
        break
      case "publications":
        filtered.sort((a, b) => b.publications - a.publications)
        break
      case "trees":
        filtered.sort((a, b) => b.trees - a.trees)
        break
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        break
    }

    return filtered
  }, [searchQuery, selectedField, selectedCountry, selectedUniversity, sortBy])

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedField("all")
    setSelectedCountry("all")
    setSelectedUniversity("all")
    setSortBy("recent")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center space-x-2">
              <BeakerIcon className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">Research Labs</span>
            </div>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/login")}>
            Sign In
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Discover Research Labs</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore research laboratories from around the world that are using Knowledge Capture to organize their work.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Search Bar */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search labs, universities, research areas, topics, or researchers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-12 text-base"
                  />
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center">
                      <FunnelIcon className="h-4 w-4 mr-1" />
                      Research Field
                    </label>
                    <Select value={selectedField} onValueChange={setSelectedField}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Fields" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Fields</SelectItem>
                        {fields.map(field => (
                          <SelectItem key={field} value={field}>{field}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center">
                      <GlobeAltIcon className="h-4 w-4 mr-1" />
                      Country
                    </label>
                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Countries" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Countries</SelectItem>
                        {countries.map(country => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center">
                      <AcademicCapIcon className="h-4 w-4 mr-1" />
                      University
                    </label>
                    <Select value={selectedUniversity} onValueChange={setSelectedUniversity}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Universities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Universities</SelectItem>
                        {universities.map(university => (
                          <SelectItem key={university} value={university}>{university}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Sort By</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent">Most Recent</SelectItem>
                        <SelectItem value="members">Most Members</SelectItem>
                        <SelectItem value="publications">Most Publications</SelectItem>
                        <SelectItem value="trees">Most Trees</SelectItem>
                        <SelectItem value="name">Name (A-Z)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button variant="outline" onClick={clearFilters} className="w-full">
                      Clear Filters
                    </Button>
                  </div>
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredLabs.length} of {mockLabs.length} research labs
                  </p>
                  {(searchQuery || selectedField !== "all" || selectedCountry !== "all" || selectedUniversity !== "all") && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Labs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLabs.map((lab) => (
            <Card key={lab.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Lab Header */}
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
                        <p className="text-xs text-muted-foreground">{lab.country}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {lab.field}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {lab.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <UserGroupIcon className="h-4 w-4" />
                      <span>{lab.members} members</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FolderIcon className="h-4 w-4" />
                      <span>{lab.trees} trees</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <TagIcon className="h-4 w-4" />
                      <span>{lab.publications} papers</span>
                    </div>
                  </div>

                  {/* Key Researchers */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Key Researchers:</p>
                    <div className="space-y-1">
                      {lab.researchers.slice(0, 2).map((researcher) => (
                        <Link key={researcher.id} href={`/researcher/${researcher.id}`}>
                          <div className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {researcher.avatar}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{researcher.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{researcher.title}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {lab.researchers.length > 2 && (
                        <p className="text-xs text-muted-foreground pl-8">
                          +{lab.researchers.length - 2} more researchers
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Research Topics */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Research Topics:</p>
                    <div className="flex flex-wrap gap-1">
                      {lab.topics.slice(0, 3).map((topic, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                      {lab.topics.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{lab.topics.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Recent Projects */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Recent Projects:</p>
                    <div className="flex flex-wrap gap-1">
                      {lab.projects.slice(0, 2).map((project, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
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

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground">
                      Last activity: {new Date(lab.lastActivity).toLocaleDateString()}
                    </div>
                    {lab.website && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={lab.website} target="_blank" rel="noopener noreferrer">
                          Visit Website
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* No Results */}
        {filteredLabs.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <BeakerIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No labs found</h3>
              <p className="text-muted-foreground mb-6">
                Try adjusting your search terms or filters to find research labs.
              </p>
              <Button onClick={clearFilters}>
                Clear All Filters
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8 px-4 mt-16">
        <div className="container mx-auto max-w-6xl text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <BeakerIcon className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold text-foreground">Knowledge Capture</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Join the growing community of researchers organizing their knowledge.
          </p>
          <Button onClick={() => (window.location.href = "/")}>
            Get Started
          </Button>
        </div>
      </footer>
    </div>
  )
}
