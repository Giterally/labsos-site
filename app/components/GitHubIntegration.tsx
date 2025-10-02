"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  CodeBracketIcon,
  WrenchIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline"

interface Repository {
  id: string
  name: string
  url: string
  language: string
  lastCommit: string
  branches: string[]
  pullRequests: PullRequest[]
  issues: Issue[]
}

interface PullRequest {
  id: string
  title: string
  status: 'open' | 'merged' | 'closed'
  author: string
  createdAt: string
  reviewStatus: 'pending' | 'approved' | 'changes_requested'
}

interface Issue {
  id: string
  title: string
  status: 'open' | 'closed'
  priority: 'low' | 'medium' | 'high'
  assignee: string
}

export default function GitHubIntegration() {
  const [repositories, setRepositories] = useState<Repository[]>([
    {
      id: "1",
      name: "data-processing-pipeline",
      url: "https://github.com/lab/data-processing-pipeline",
      language: "Python",
      lastCommit: "2024-03-15",
      branches: ["main", "feature/data-cleanup", "bugfix/validation"],
      pullRequests: [
        {
          id: "pr-1",
          title: "Add data validation functions",
          status: "open",
          author: "Dr. Michael Chen",
          createdAt: "2024-03-14",
          reviewStatus: "pending"
        },
        {
          id: "pr-2",
          title: "Improve error handling",
          status: "open",
          author: "Sarah Johnson",
          createdAt: "2024-03-13",
          reviewStatus: "approved"
        }
      ],
      issues: [
        {
          id: "issue-1",
          title: "Memory usage optimization needed",
          status: "open",
          priority: "high",
          assignee: "Dr. Michael Chen"
        }
      ]
    }
  ])

  const [newRepoUrl, setNewRepoUrl] = useState("")
  const [connecting, setConnecting] = useState(false)

  const connectRepository = async () => {
    if (!newRepoUrl) return
    
    setConnecting(true)
    // Simulate API call
    setTimeout(() => {
      const newRepo: Repository = {
        id: Date.now().toString(),
        name: newRepoUrl.split('/').pop() || 'new-repo',
        url: newRepoUrl,
        language: "Unknown",
        lastCommit: new Date().toISOString().split('T')[0],
        branches: ["main"],
        pullRequests: [],
        issues: []
      }
      
      setRepositories([...repositories, newRepo])
      setNewRepoUrl("")
      setConnecting(false)
    }, 1000)
  }

  const getReviewStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircleIcon className="h-4 w-4 text-green-600" />
      case 'changes_requested':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
      default:
        return <ClockIcon className="h-4 w-4 text-yellow-600" />
    }
  }

  const getReviewStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'changes_requested':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-green-100 text-green-800 border-green-200'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">GitHub Integration</h3>
        <Badge variant="outline">{repositories.length} repositories</Badge>
      </div>

      {/* Connect New Repository */}
      <Card>
        <CardHeader>
          <CardTitle>Connect Repository</CardTitle>
          <CardDescription>Link your GitHub repository to track code changes and reviews</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <div className="flex-1">
              <Label htmlFor="repo-url" className="sr-only">Repository URL</Label>
              <Input
                id="repo-url"
                type="url"
                placeholder="https://github.com/username/repository"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
              />
            </div>
            <Button 
              onClick={connectRepository} 
              disabled={!newRepoUrl || connecting}
            >
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Repository List */}
      <div className="space-y-4">
        {repositories.map((repo) => (
          <Card key={repo.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CodeBracketIcon className="h-5 w-5 text-blue-600" />
                  <div>
                    <CardTitle className="text-base">{repo.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {repo.language} • Last commit: {repo.lastCommit}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{repo.branches.length} branches</Badge>
                  <Button variant="outline" size="sm">
                    <WrenchIcon className="h-4 w-4 mr-2" />
                    View on GitHub
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pull Requests */}
              {repo.pullRequests.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center space-x-2">
                    <DocumentTextIcon className="h-4 w-4" />
                    <span>Pull Requests ({repo.pullRequests.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {repo.pullRequests.map((pr) => (
                      <div key={pr.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {getReviewStatusIcon(pr.reviewStatus)}
                          <div>
                            <p className="text-sm font-medium">{pr.title}</p>
                            <p className="text-xs text-muted-foreground">
                              by {pr.author} • {pr.createdAt}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getReviewStatusColor(pr.reviewStatus)}>
                            {pr.reviewStatus.replace('_', ' ')}
                          </Badge>
                          <Button variant="outline" size="sm">
                            Review
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues */}
              {repo.issues.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center space-x-2">
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>Issues ({repo.issues.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {repo.issues.map((issue) => (
                      <div key={issue.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{issue.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Assigned to {issue.assignee}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getPriorityColor(issue.priority)}>
                            {issue.priority}
                          </Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {repo.pullRequests.length === 0 && repo.issues.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active pull requests or issues
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {repositories.length === 0 && (
        <div className="text-center py-8">
          <CodeBracketIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No repositories connected yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your first GitHub repository to start tracking code changes
          </p>
        </div>
      )}
    </div>
  )
} 