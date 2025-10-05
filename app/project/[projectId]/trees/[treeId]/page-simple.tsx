"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { useRouter, useParams } from "next/navigation"

export default function SimpleExperimentTreePage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string
  const treeId = params.treeId as string

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
                onClick={() => router.push(`/project/${projectId}`)}
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Project
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Quality Control Pipeline</h1>
                <p className="text-muted-foreground">RNA-seq quality control and preprocessing steps</p>
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
          {/* Left Sidebar - Experiment Steps */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Experiment Steps</CardTitle>
                <CardDescription>
                  Click on a step to view details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium">Raw Data Collection</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Data</p>
                  </div>
                  <div className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">Quality Assessment</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Software (Completed)</p>
                  </div>
                  <div className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-sm font-medium">Quality Control Report</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Results</p>
                  </div>
                  <div className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-sm font-medium">Trimming Protocol</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Protocols</p>
                  </div>
                  <div className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">Trimmomatic Processing</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Software (Completed)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tree Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge>Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <Badge variant="outline">Protocol</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Steps:</span>
                    <span>8</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Node Details */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Raw Data Collection</CardTitle>
                <CardDescription>
                  Collect raw RNA-seq data from sequencing facility
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="content" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="attachments">Attachments</TabsTrigger>
                    <TabsTrigger value="links">Links</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </TabsList>

                  <TabsContent value="content">
                    <div className="border rounded-lg p-4">
                      <p className="text-sm">
                        This step involves collecting raw RNA-seq data from the sequencing facility. 
                        The data typically comes in FASTQ format and includes both forward and reverse reads.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="attachments">
                    <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
                      <p>No attachments yet. Click Edit to add files.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="links">
                    <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
                      <p>No links yet. Click Edit to add external resources.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="metadata">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium mb-2">Step Information</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Type:</span>
                              <Badge>Data</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Position:</span>
                              <span>1</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Timestamps</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Created:</span>
                              <span>1/15/2024</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Updated:</span>
                              <span>1/15/2024</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
