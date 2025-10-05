"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"

export default function SimpleProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/projects")}
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Projects
              </Button>
              <div>
                <h1 className="text-2xl font-bold">RNA-seq Analysis Pipeline</h1>
                <p className="text-muted-foreground">Comprehensive pipeline for RNA sequencing data analysis</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">Active</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>Project Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Institution:</span>
                    <span className="text-sm text-muted-foreground">University of Science</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm text-muted-foreground">Bioinformatics</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge>Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Team Size:</span>
                    <span className="text-sm text-muted-foreground">3 members</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Members */}
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">JS</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">John Smith</p>
                      <p className="text-xs text-muted-foreground">Lead Developer</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">MJ</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">Maria Johnson</p>
                      <p className="text-xs text-muted-foreground">Bioinformatician</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">AK</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">Alex Kim</p>
                      <p className="text-xs text-muted-foreground">Data Analyst</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="trees" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="trees">Experiment Trees</TabsTrigger>
                <TabsTrigger value="software">Software & Tools</TabsTrigger>
                <TabsTrigger value="datasets">Datasets</TabsTrigger>
                <TabsTrigger value="outputs">Outputs</TabsTrigger>
              </TabsList>

              <TabsContent value="trees" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Experiment Trees</CardTitle>
                    <CardDescription>
                      Manage your experimental workflows and protocols
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Quality Control Pipeline</h3>
                        <p className="text-sm text-muted-foreground">RNA-seq quality control and preprocessing steps</p>
                        <div className="flex items-center space-x-4 mt-2">
                          <Badge variant="outline">8 nodes</Badge>
                          <Badge variant="outline">Active</Badge>
                        </div>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Differential Expression Analysis</h3>
                        <p className="text-sm text-muted-foreground">Statistical analysis of gene expression differences</p>
                        <div className="flex items-center space-x-4 mt-2">
                          <Badge variant="outline">6 nodes</Badge>
                          <Badge variant="outline">Active</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="software" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Software & Tools</CardTitle>
                    <CardDescription>
                      Manage software, libraries, and tools used in your project
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">FastQC</h3>
                        <p className="text-sm text-muted-foreground">Version 0.11.9 - Quality Control</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Trimmomatic</h3>
                        <p className="text-sm text-muted-foreground">Version 0.39 - Preprocessing</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">DESeq2</h3>
                        <p className="text-sm text-muted-foreground">Version 1.38.3 - Analysis</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="datasets" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Datasets</CardTitle>
                    <CardDescription>
                      Organize and track your research datasets
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Sample_001_R1.fastq</h3>
                        <p className="text-sm text-muted-foreground">Raw Data - 2.4 GB</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Sample_001_R2.fastq</h3>
                        <p className="text-sm text-muted-foreground">Raw Data - 2.4 GB</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">processed_counts.csv</h3>
                        <p className="text-sm text-muted-foreground">Processed Data - 15 MB</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="outputs" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Outputs</CardTitle>
                    <CardDescription>
                      Manage research outputs like publications, reports, and results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Quality Control Report</h3>
                        <p className="text-sm text-muted-foreground">Report - Published</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">Differential Expression Results</h3>
                        <p className="text-sm text-muted-foreground">Results - Draft</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold">RNA-seq Analysis Paper</h3>
                        <p className="text-sm text-muted-foreground">Publication - In Review</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
