"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  BeakerIcon,
  DocumentTextIcon,
  PlusIcon,
  BellIcon,
  Cog6ToothIcon,
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  CodeBracketIcon,
  TagIcon,
  CalendarIcon,
  EyeIcon,
  PencilIcon,
} from "@heroicons/react/24/outline"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function DocsPage() {
  const [user, setUser] = useState<any>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
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

  const documents = [
    {
      id: 1,
      title: "RNA-seq Analysis Protocol",
      description:
        "Comprehensive protocol for RNA sequencing data analysis including quality control steps and best practices.",
      content: `# RNA-seq Analysis Protocol

## Overview
This protocol outlines the standard procedure for analyzing RNA sequencing data in our lab.

## Quality Control Steps

### 1. Raw Data Assessment
First, we assess the quality of raw sequencing data using FastQC:

\`\`\`bash
fastqc input.fastq -o results/
\`\`\`

### 2. Trimming and Filtering
Remove low-quality bases and adapter sequences:

\`\`\`bash
trimmomatic SE input.fastq output.fastq ILLUMINACLIP:adapters.fa:2:30:10 LEADING:3 TRAILING:3 SLIDINGWINDOW:4:15 MINLEN:36
\`\`\`

## Alignment
Align reads to reference genome using STAR:

\`\`\`bash
STAR --genomeDir /path/to/genome --readFilesIn trimmed.fastq --outFileNamePrefix sample_
\`\`\`

## Notes
- Always check alignment rates (should be >80%)
- Document any parameter changes
- Keep detailed logs of all processing steps`,
      project: "RNA-seq Analysis Pipeline",
      author: "John Smith",
      lastUpdated: "2 hours ago",
      tags: ["Protocol", "RNA-seq", "Quality Control"],
      linkedFiles: ["quality_control.py", "alignment.sh"],
      createdDate: "2024-01-15",
    },
    {
      id: 2,
      title: "Protein Structure Prediction Methods",
      description:
        "Documentation of machine learning approaches used for protein structure prediction in our current research.",
      content: `# Protein Structure Prediction Methods

## Introduction
This document describes the ML approaches we're using for protein structure prediction.

## AlphaFold Integration
We use AlphaFold2 as our baseline model:

\`\`\`python
from alphafold import model
from alphafold import data

# Load pre-trained model
model_runner = model.RunModel(model_config, model_params)
\`\`\`

## Custom Neural Network
Our custom architecture improves upon AlphaFold for specific protein families:

\`\`\`python
import tensorflow as tf

class ProteinStructureNet(tf.keras.Model):
    def __init__(self, num_residues):
        super().__init__()
        self.attention = tf.keras.layers.MultiHeadAttention(8, 64)
        self.dense = tf.keras.layers.Dense(256, activation='relu')
\`\`\`

## Results
Current accuracy metrics:
- GDT-TS: 0.85
- RMSD: 2.3 Å`,
      project: "Protein Structure Prediction",
      author: "Maria Johnson",
      lastUpdated: "1 day ago",
      tags: ["Machine Learning", "Protein", "AlphaFold"],
      linkedFiles: ["protein_model.py", "training_data.csv"],
      createdDate: "2024-02-01",
    },
    {
      id: 3,
      title: "Lab Meeting Notes - Feb 2024",
      description: "Summary of discussions and decisions from February lab meetings.",
      content: `# Lab Meeting Notes - February 2024

## Meeting 1 - Feb 5, 2024

### Attendees
- Dr. Jane Smith (PI)
- John Smith
- Maria Johnson
- Alex Kim

### Project Updates

#### RNA-seq Pipeline
- Quality control module completed
- Need to optimize alignment parameters
- **Action**: John to test different STAR settings

#### Protein Prediction
- AlphaFold integration successful
- Custom model showing promising results
- **Action**: Maria to prepare manuscript draft

### New Equipment
- Ordered new GPU cluster for ML training
- Expected delivery: March 15

### Upcoming Deadlines
- Grant application due March 1
- Conference abstract deadline Feb 20`,
      project: "General",
      author: "Dr. Jane Smith",
      lastUpdated: "3 days ago",
      tags: ["Meeting Notes", "Updates", "Deadlines"],
      linkedFiles: [],
      createdDate: "2024-02-05",
    },
  ]

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
              <BeakerIcon className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">LabsOS</span>
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
                {user.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!selectedDoc ? (
          <>
            {/* Documentation Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Documentation</h1>
                <p className="text-muted-foreground">Lab protocols, notes, and knowledge base</p>
              </div>
              <Button onClick={() => setShowNewDoc(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-4 mb-6">
              <Input placeholder="Search documentation..." className="flex-1" />
              <Button variant="outline">All Types</Button>
              <Button variant="outline">All Projects</Button>
            </div>

            {/* Documents Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <Card
                  key={doc.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <DocumentTextIcon className="h-6 w-6 text-primary" />
                      <Button variant="ghost" size="sm">
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardTitle className="text-xl">{doc.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{doc.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {doc.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <div>Project: {doc.project}</div>
                      <div>
                        By {doc.author} • {doc.lastUpdated}
                      </div>
                    </div>

                    {doc.linkedFiles.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LinkIcon className="h-3 w-3" />
                        <span>{doc.linkedFiles.length} linked files</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          /* Document Detail View */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedDoc(null)}>
                  <ArrowLeftIcon className="h-4 w-4" />
                </Button>
                <DocumentTextIcon className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold text-foreground">{selectedDoc.title}</h1>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
                  {isEditing ? <EyeIcon className="h-4 w-4 mr-2" /> : <PencilIcon className="h-4 w-4 mr-2" />}
                  {isEditing ? "Preview" : "Edit"}
                </Button>
                <Button variant="ghost" size="sm">
                  <EllipsisVerticalIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3">
                {isEditing ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Edit Document</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={selectedDoc.content}
                        className="min-h-[600px] font-mono text-sm"
                        placeholder="Write your documentation in Markdown..."
                      />
                      <div className="flex gap-2 mt-4">
                        <Button>Save Changes</Button>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-8">
                      <div className="prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed">{selectedDoc.content}</pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Document Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Document Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Created:</span>
                        <span>{selectedDoc.createdDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <PencilIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Author:</span>
                        <span>{selectedDoc.author}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <DocumentTextIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Project:</span>
                        <span>{selectedDoc.project}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TagIcon className="h-5 w-5" />
                      Tags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedDoc.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-3 bg-transparent">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Tag
                    </Button>
                  </CardContent>
                </Card>

                {/* Linked Files */}
                {selectedDoc.linkedFiles.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" />
                        Linked Files
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedDoc.linkedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 border rounded hover:bg-muted/50 cursor-pointer"
                        >
                          <CodeBracketIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{file}</span>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="w-full mt-3 bg-transparent">
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Link File
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">JS</AvatarFallback>
                      </Avatar>
                      <div className="text-sm">
                        <span className="font-medium">John Smith</span> updated this document
                        <div className="text-muted-foreground">2 hours ago</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">MJ</AvatarFallback>
                      </Avatar>
                      <div className="text-sm">
                        <span className="font-medium">Maria Johnson</span> added quality control section
                        <div className="text-muted-foreground">1 day ago</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Document Modal */}
      {showNewDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Create New Document</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowNewDoc(false)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Document Title *</Label>
                  <Input id="doc-title" placeholder="e.g., RNA-seq Analysis Protocol" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-description">Description</Label>
                  <Textarea id="doc-description" placeholder="Brief description of this document..." rows={2} />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-project">Project</Label>
                    <Input id="doc-project" placeholder="Associated project..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-type">Document Type</Label>
                    <Input id="doc-type" placeholder="Protocol, Notes, Guide..." />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-tags">Tags</Label>
                  <Input id="doc-tags" placeholder="Protocol, RNA-seq, Quality Control (comma separated)" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-content">Content</Label>
                  <Textarea
                    id="doc-content"
                    placeholder="Write your documentation in Markdown format..."
                    rows={8}
                    className="font-mono"
                  />
                </div>

                <Separator />

                <div className="flex gap-4">
                  <Button type="submit" className="flex-1">
                    Create Document
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowNewDoc(false)}>
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
