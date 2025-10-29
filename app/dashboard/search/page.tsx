"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  BeakerIcon,
  MagnifyingGlassIcon,
  BellIcon,
  Cog6ToothIcon,
  ArrowLeftIcon,
  DocumentTextIcon,
  FolderIcon,
  CodeBracketIcon,
  TableCellsIcon,
  ClockIcon,
  TagIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SearchPage() {
  const [user, setUser] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedFilter, setSelectedFilter] = useState("all")
  const router = useRouter()

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("labsos_authenticated")
    const userData = localStorage.getItem("labsos_user")

    if (!isAuthenticated || !userData) {
      router.push("/login")
      return
    }

    setUser(JSON.parse(userData))
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem("labsos_authenticated")
    localStorage.removeItem("labsos_user")
    router.push("/")
  }

  // Mock search results
  const allResults = [
    {
      id: 1,
      type: "project",
      title: "RNA-seq Analysis Pipeline",
      description:
        "Comprehensive pipeline for RNA sequencing data analysis including quality control, alignment, and differential expression analysis.",
      tags: ["RNA-seq", "Bioinformatics", "Pipeline"],
      author: "John Smith",
      lastUpdated: "2 hours ago",
      project: "RNA-seq Analysis Pipeline",
      relevance: 95,
    },
    {
      id: 2,
      type: "document",
      title: "RNA-seq Analysis Protocol",
      description:
        "Comprehensive protocol for RNA sequencing data analysis including quality control steps and best practices.",
      tags: ["Protocol", "RNA-seq", "Quality Control"],
      author: "John Smith",
      lastUpdated: "2 hours ago",
      project: "RNA-seq Analysis Pipeline",
      relevance: 92,
    },
    {
      id: 3,
      type: "script",
      title: "quality_control.py",
      description: "Python script for performing quality control on RNA-seq data using FastQC and custom metrics.",
      tags: ["Python", "Quality Control", "FastQC"],
      author: "John Smith",
      lastUpdated: "2 hours ago",
      project: "RNA-seq Analysis Pipeline",
      relevance: 88,
    },
    {
      id: 4,
      type: "dataset",
      title: "sample_metadata.csv",
      description:
        "Sample information and experimental conditions for RNA-seq experiments including batch information.",
      tags: ["Metadata", "CSV", "Samples"],
      author: "Maria Johnson",
      lastUpdated: "3 days ago",
      project: "RNA-seq Analysis Pipeline",
      relevance: 85,
    },
    {
      id: 5,
      type: "document",
      title: "Protein Structure Prediction Methods",
      description:
        "Documentation of machine learning approaches used for protein structure prediction in our current research.",
      tags: ["Machine Learning", "Protein", "AlphaFold"],
      author: "Maria Johnson",
      lastUpdated: "1 day ago",
      project: "Protein Structure Prediction",
      relevance: 75,
    },
    {
      id: 6,
      type: "script",
      title: "alignment.sh",
      description:
        "Shell script for aligning RNA-seq reads to reference genome using STAR aligner with optimized parameters.",
      tags: ["Bash", "Alignment", "STAR"],
      author: "Alex Kim",
      lastUpdated: "1 day ago",
      project: "RNA-seq Analysis Pipeline",
      relevance: 82,
    },
  ]

  useEffect(() => {
    if (searchQuery.trim()) {
      // Filter results based on search query and selected filter
      const filtered = allResults.filter((result) => {
        const matchesQuery =
          result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          result.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          result.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesFilter = selectedFilter === "all" || result.type === selectedFilter

        return matchesQuery && matchesFilter
      })

      // Sort by relevance
      filtered.sort((a, b) => b.relevance - a.relevance)
      setSearchResults(filtered)
    } else {
      setSearchResults([])
    }
  }, [searchQuery, selectedFilter])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "project":
        return <FolderIcon className="h-5 w-5" />
      case "document":
        return <DocumentTextIcon className="h-5 w-5" />
      case "script":
        return <CodeBracketIcon className="h-5 w-5" />
      case "dataset":
        return <TableCellsIcon className="h-5 w-5" />
      default:
        return <DocumentTextIcon className="h-5 w-5" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "project":
        return "text-blue-600"
      case "document":
        return "text-green-600"
      case "script":
        return "text-purple-600"
      case "dataset":
        return "text-orange-600"
      default:
        return "text-gray-600"
    }
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-2">
              <Image
                src="/olvaro-fin.png"
                alt="Olvaro Logo"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-2xl font-bold text-foreground">Olvaro</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm">
              <BellIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm">
              <Cog6ToothIcon className="h-5 w-5" />
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {user?.full_name
                  ? user.full_name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                  : "U"}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Search Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Global Search</h1>
          <p className="text-muted-foreground">Search across all projects, documents, scripts, and datasets</p>
        </div>

        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search for projects, documents, scripts, datasets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={selectedFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedFilter("all")}
          >
            All Results
          </Button>
          <Button
            variant={selectedFilter === "project" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedFilter("project")}
          >
            <FolderIcon className="h-4 w-4 mr-2" />
            Projects
          </Button>
          <Button
            variant={selectedFilter === "document" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedFilter("document")}
          >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            Documents
          </Button>
          <Button
            variant={selectedFilter === "script" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedFilter("script")}
          >
            <CodeBracketIcon className="h-4 w-4 mr-2" />
            Scripts
          </Button>
          <Button
            variant={selectedFilter === "dataset" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedFilter("dataset")}
          >
            <TableCellsIcon className="h-4 w-4 mr-2" />
            Datasets
          </Button>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Search Results */}
          <div className="lg:col-span-3">
            {searchQuery.trim() === "" ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <MagnifyingGlassIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Start searching</h3>
                  <p className="text-muted-foreground">
                    Enter a search term to find projects, documents, scripts, and datasets across your lab.
                  </p>
                </CardContent>
              </Card>
            ) : searchResults.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <MagnifyingGlassIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No results found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search terms or filters to find what you're looking for.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Found {searchResults.length} results for "{searchQuery}"
                </div>

                {searchResults.map((result) => (
                  <Card key={result.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`${getTypeColor(result.type)} mt-1`}>{getTypeIcon(result.type)}</div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground hover:text-primary">{result.title}</h3>
                            <Badge variant="outline" className="text-xs capitalize">
                              {result.type}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{result.relevance}% match</div>
                          </div>

                          <p className="text-muted-foreground line-clamp-2">{result.description}</p>

                          <div className="flex flex-wrap gap-2">
                            {result.tags.map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {result.author}
                            </div>
                            <div className="flex items-center gap-1">
                              <FolderIcon className="h-3 w-3" />
                              {result.project}
                            </div>
                            <div className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {result.lastUpdated}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Search Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Search Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <strong>Use quotes</strong> for exact phrases:
                  <code className="block bg-muted p-1 rounded mt-1">"RNA sequencing"</code>
                </div>
                <div>
                  <strong>Search by file type:</strong>
                  <code className="block bg-muted p-1 rounded mt-1">type:script python</code>
                </div>
                <div>
                  <strong>Search by author:</strong>
                  <code className="block bg-muted p-1 rounded mt-1">author:"John Smith"</code>
                </div>
                <div>
                  <strong>Search by project:</strong>
                  <code className="block bg-muted p-1 rounded mt-1">project:RNA-seq</code>
                </div>
              </CardContent>
            </Card>

            {/* Recent Searches */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Searches</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  "RNA sequencing protocols",
                  "quality_control.py",
                  "protein structure prediction",
                  "GWAS meta-analysis",
                  "sample metadata",
                ].map((search, index) => (
                  <div
                    key={index}
                    className="text-sm p-2 bg-muted rounded cursor-pointer hover:bg-muted/80"
                    onClick={() => setSearchQuery(search)}
                  >
                    {search}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Popular Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TagIcon className="h-5 w-5" />
                  Popular Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {[
                    "RNA-seq",
                    "Python",
                    "Bioinformatics",
                    "Quality Control",
                    "Machine Learning",
                    "Protein",
                    "GWAS",
                    "Pipeline",
                    "Protocol",
                    "Analysis",
                    "R",
                    "Bash",
                  ].map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => setSearchQuery(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
