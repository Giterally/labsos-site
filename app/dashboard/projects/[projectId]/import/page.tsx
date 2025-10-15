'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  Github, 
  FileText, 
  Video, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Trash2,
  History,
  Plus,
  RotateCcw
} from 'lucide-react';

interface IngestionSource {
  id: string;
  source_type: string;
  source_name: string;
  file_size?: number;
  mime_type?: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: any;
  result?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export default function ImportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [sources, setSources] = useState<IngestionSource[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [githubImporting, setGithubImporting] = useState(false);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // GitHub import state
  const [githubUrl, setGithubUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  
  // Import management state
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Define fetchData FIRST (before useEffect)
  const fetchData = useCallback(async () => {
    try {
      // Get session for API call if user is authenticated
      let headers: HeadersInit = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      // Fetch sources
      const sourcesResponse = await fetch(`/api/import/upload?projectId=${projectId}`, { 
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!sourcesResponse.ok) {
        console.error('Failed to fetch sources:', await sourcesResponse.text());
        return;
      }
      const sourcesData = await sourcesResponse.json();
      setSources(sourcesData.sources || []);

      // Fetch jobs (you'd need to implement this endpoint)
      // const jobsResponse = await fetch(`/api/projects/${projectId}/jobs`);
      // const jobsData = await jobsResponse.json();
      // setJobs(jobsData.jobs || []);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Request timed out');
      }
      setLoading(false);
    }
  }, [projectId]);

  // THEN use it in useEffect
  useEffect(() => {
    setLoading(true);  // Only set loading on mount
    fetchData();
    // Poll for updates every 30 seconds (reduced frequency)
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      // Get session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('projectId', projectId);

      const response = await fetch('/api/import/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result = await response.json();

              if (response.ok) {
                setSelectedFile(null);
                // Show success message
                alert(`File uploaded successfully! Processing started.`);
                // Refresh data immediately and then again after a short delay
                fetchData();
                setTimeout(fetchData, 2000);
              } else {
                alert(`Upload failed: ${result.error}`);
              }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleGitHubImport = async () => {
    if (!githubUrl) return;

    setGithubImporting(true);
    try {
      // Get session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          repoUrl: githubUrl,
          projectId,
          token: githubToken || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setGithubUrl('');
        setGithubToken('');
        fetchData(); // Refresh data
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } catch (error) {
      console.error('GitHub import error:', error);
      alert('Import failed');
    } finally {
      setGithubImporting(false);
    }
  };

  // Import management functions
  const handleSelectSource = (sourceId: string, checked: boolean) => {
    const newSelected = new Set(selectedSources);
    if (checked) {
      newSelected.add(sourceId);
    } else {
      newSelected.delete(sourceId);
    }
    setSelectedSources(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSources(new Set(sources.map(s => s.id)));
    } else {
      setSelectedSources(new Set());
    }
  };

  const handleClearSelected = async () => {
    if (selectedSources.size === 0) return;
    
    setClearing(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/sources`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sourceIds: Array.from(selectedSources),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(`Successfully deleted ${result.deletedCount} source(s)`);
        setSelectedSources(new Set());
        await fetchData();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete sources');
      }
    } catch (error) {
      console.error('Clear sources error:', error);
      setError(`Failed to delete sources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearing(false);
    }
  };

  const handleClearAll = async () => {
    const confirmed = confirm(
      'Are you sure you want to clear ALL imports? This will delete all uploaded files, processed data, and generated nodes. This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    setClearing(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/sources`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clearAll: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(`Successfully cleared all imports (${result.deletedCount} sources)`);
        setSelectedSources(new Set());
        await fetchData();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to clear all sources');
      }
    } catch (error) {
      console.error('Clear all sources error:', error);
      setError(`Failed to clear all sources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      uploaded: 'secondary',
      processing: 'default',
      completed: 'default',
      failed: 'destructive',
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'excel':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'github':
        return <Github className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Data</h1>
          <p className="text-muted-foreground">
            Upload files or connect repositories to automatically generate experiment nodes
          </p>
        </div>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Success Alert */}
      {success && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">File Upload</TabsTrigger>
          <TabsTrigger value="github">GitHub Import</TabsTrigger>
          <TabsTrigger value="sources">Import Queue</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="build">Build Tree</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Upload PDFs, Excel files, videos, or text documents to extract experiment protocols
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Select File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.xlsx,.xls,.mp4,.avi,.mov,.txt,.md"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              
              <Button 
                onClick={handleFileUpload} 
                disabled={!selectedFile || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </>
                )}
              </Button>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Supported formats: PDF, Excel (.xlsx, .xls), Video (.mp4, .avi, .mov), Text (.txt, .md)
                  <br />
                  Maximum file size: 100MB
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="github" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import from GitHub</CardTitle>
              <CardDescription>
                Connect a GitHub repository to extract code, documentation, and research artifacts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-url">Repository URL</Label>
                <Input
                  id="github-url"
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="github-token">GitHub Token (Optional)</Label>
                <Input
                  id="github-token"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Required for private repositories. Create a token with repo access.
                </p>
              </div>
              
              <Button 
                onClick={handleGitHubImport} 
                disabled={!githubUrl || githubImporting}
                className="w-full"
              >
                {githubImporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4 mr-2" />
                    Import Repository
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Import Queue</CardTitle>
                  <CardDescription>
                    Track the status of your uploaded files and repositories
                  </CardDescription>
                </div>
                {sources.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAll(selectedSources.size !== sources.length)}
                    >
                      {selectedSources.size === sources.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    {selectedSources.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearSelected}
                        disabled={clearing}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedSources.size})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No imports yet. Upload a file or import a repository to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        selectedSources.has(source.id) ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <input
                          type="checkbox"
                          checked={selectedSources.has(source.id)}
                          onChange={(e) => handleSelectSource(source.id, e.target.checked)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        {getSourceIcon(source.source_type)}
                        <div>
                          <p className="font-medium">{source.source_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {source.source_type.toUpperCase()} • {formatFileSize(source.file_size)} • 
                            {new Date(source.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        {getStatusIcon(source.status)}
                        {getStatusBadge(source.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Import Management
              </CardTitle>
              <CardDescription>
                Manage your imports, clear data, and start fresh
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Import Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Import Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Sources:</span>
                      <span className="font-medium">{sources.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Completed:</span>
                      <span className="font-medium text-green-600">
                        {sources.filter(s => s.status === 'completed').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Processing:</span>
                      <span className="font-medium text-yellow-600">
                        {sources.filter(s => s.status === 'processing').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Failed:</span>
                      <span className="font-medium text-red-600">
                        {sources.filter(s => s.status === 'failed').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Selected:</span>
                      <span className="font-medium text-blue-600">{selectedSources.size}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        const uploadTab = document.querySelector('[value="upload"]') as HTMLElement;
                        uploadTab?.click();
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Upload New Files
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        const githubTab = document.querySelector('[value="github"]') as HTMLElement;
                        githubTab?.click();
                      }}
                    >
                      <Github className="h-4 w-4 mr-2" />
                      Import from GitHub
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={fetchData}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Status
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Clear All Section */}
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-base text-red-700 flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Start Fresh
                  </CardTitle>
                  <CardDescription>
                    Clear all imports and start over. This will delete all uploaded files, processed data, and generated nodes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h4 className="font-medium text-red-800 mb-2">⚠️ Warning</h4>
                      <p className="text-sm text-red-700">
                        This action will permanently delete:
                      </p>
                      <ul className="text-sm text-red-700 mt-2 ml-4 list-disc">
                        <li>All uploaded files and their storage</li>
                        <li>All processed chunks and embeddings</li>
                        <li>All AI-generated proposed nodes</li>
                        <li>All experiment trees created from these sources</li>
                      </ul>
                    </div>
                    
                    <Button
                      variant="destructive"
                      onClick={handleClearAll}
                      disabled={clearing || sources.length === 0}
                      className="w-full"
                    >
                      {clearing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Clearing All Data...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear All Imports ({sources.length} sources)
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="build" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Build Experiment Tree
              </CardTitle>
              <CardDescription>
                Review AI-generated experiment nodes and create your experiment tree
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {sources.filter(s => s.status === 'completed').length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Processed Files</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload and process some files first to generate experiment nodes.
                  </p>
                  <Button onClick={() => {
                    const uploadTab = document.querySelector('[value="upload"]') as HTMLElement;
                    uploadTab?.click();
                  }}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <h3 className="font-semibold">Ready to Build Tree</h3>
                      <p className="text-sm text-muted-foreground">
                        {sources.filter(s => s.status === 'completed').length} files processed
                      </p>
                    </div>
                    <Button 
                      onClick={() => window.open(`/dashboard/projects/${projectId}/proposals`, '_blank')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Review Proposals
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">What happens next?</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span>AI analyzes your files and generates experiment nodes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                          <span>Review and select the nodes you want to include</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span>Build your experiment tree with selected nodes</span>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Processing Status</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Completed:</span>
                          <span className="font-medium text-green-600">
                            {sources.filter(s => s.status === 'completed').length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Processing:</span>
                          <span className="font-medium text-yellow-600">
                            {sources.filter(s => s.status === 'processing').length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Failed:</span>
                          <span className="font-medium text-red-600">
                            {sources.filter(s => s.status === 'failed').length}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
