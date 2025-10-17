'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  RotateCcw,
  ArrowLeft,
  Loader2
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
  const router = useRouter();
  const projectId = params.projectId as string;
  
  const [sources, setSources] = useState<IngestionSource[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [githubImporting, setGithubImporting] = useState(false);
  
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  
  // GitHub import state
  const [githubUrl, setGithubUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  
  // Import management state
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatingProposals, setGeneratingProposals] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalsStats, setProposalsStats] = useState<{ totalNodes: number; totalBlocks: number; blockBreakdown: { type: string; count: number }[] } | null>(null);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('upload');
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [buildingTree, setBuildingTree] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  
  // Progress tracking state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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
      const fetchedSources = sourcesData.sources || [];
      
      // Automatically detect and fix stuck files (processing > 10 minutes)
      const now = Date.now();
      const TEN_MINUTES = 10 * 60 * 1000;
      
      const stuckFiles = fetchedSources.filter((source: IngestionSource) => {
        if (source.status !== 'processing') return false;
        const updatedAt = new Date(source.updated_at).getTime();
        return (now - updatedAt) > TEN_MINUTES;
      });
      
      if (stuckFiles.length > 0) {
        console.log(`[IMPORT] Auto-detecting ${stuckFiles.length} stuck files, marking as failed...`);
        
        // Mark stuck files as failed (fire and forget, don't block UI)
        Promise.all(stuckFiles.map(async (source: IngestionSource) => {
          try {
            await fetch(`/api/projects/${projectId}/fix-stuck-files`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ sourceIds: [source.id] }),
            });
            console.log(`[IMPORT] Marked stuck file as failed: ${source.source_name}`);
          } catch (err) {
            console.error(`[IMPORT] Failed to mark stuck file: ${source.source_name}`, err);
          }
        })).then(() => {
          // Refresh data after fixing stuck files
          setTimeout(() => fetchData(), 2000);
        });
      }
      
      setSources(fetchedSources);

      // Fetch proposals
      const proposalsResponse = await fetch(`/api/projects/${projectId}/proposals`, { 
        headers,
        signal: controller.signal
      });
      
      if (proposalsResponse.ok) {
        const proposalsData = await proposalsResponse.json();
        setProposals(proposalsData.proposals || []);
        setProposalsStats(proposalsData.stats || null);
      } else {
        console.error('Failed to fetch proposals:', proposalsResponse.status);
        setProposals([]);
        setProposalsStats(null);
      }

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

  // SSE connection for real-time updates
  const connectSSE = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log('No session token available for SSE connection');
      return null;
    }

    // Check if token is expired (JWT tokens typically expire in 1 hour)
    const tokenPayload = JSON.parse(atob(session.access_token.split('.')[1]));
    const tokenExpiry = tokenPayload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    
    if (tokenExpiry - now < 60000) { // If token expires in less than 1 minute
      console.log('Token expires soon, refreshing session');
      const { data: { session: newSession } } = await supabase.auth.refreshSession();
      if (!newSession?.access_token) {
        console.log('Failed to refresh session for SSE');
        return null;
      }
      session.access_token = newSession.access_token;
    }

    // EventSource doesn't support custom headers, so we need to pass the token as a query parameter
    const eventSource = new EventSource(`/api/projects/${projectId}/status?token=${encodeURIComponent(session.access_token)}`);

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE message received:', data);

        switch (data.type) {
          case 'connected':
          case 'subscribed':
            console.log('SSE:', data.message);
            break;
          
          case 'status_update':
            console.log('Status update:', data);
            // Update the specific source in our state
            setSources(prevSources => 
              prevSources.map(source => 
                source.id === data.sourceId 
                  ? { ...source, status: data.status, updated_at: data.updatedAt }
                  : source
              )
            );
            break;
          
          case 'new_proposal':
          case 'proposal_update':
            console.log('Proposal update:', data);
            // Refresh proposals when they change
            fetchData();
            break;
          
          case 'proposal_deleted':
            console.log('Proposal deleted:', data);
            // Remove from selected if it was selected
            setSelectedProposals(prev => {
              const newSelected = new Set(prev);
              newSelected.delete(data.proposalId);
              return newSelected;
            });
            // Refresh proposals
            fetchData();
            break;
          
          case 'heartbeat':
            // Keep connection alive
            break;
          
          default:
            console.log('Unknown SSE message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setSseConnected(false);
      
      // Close the current connection
      eventSource.close();
      
      // Attempt to reconnect after 5 seconds, but only if we're still on the page
      setTimeout(async () => {
        try {
          console.log('Attempting to reconnect SSE...');
          const newEventSource = await connectSSE();
          if (!newEventSource) {
            console.log('Failed to reconnect SSE, will retry in 30 seconds');
            setTimeout(() => connectSSE(), 30000);
          }
        } catch (reconnectError) {
          console.error('SSE reconnection failed:', reconnectError);
          // Retry again in 30 seconds
          setTimeout(() => connectSSE(), 30000);
        }
      }, 5000);
    };

    return eventSource;
  }, [projectId, fetchData]);

  // THEN use it in useEffect
  useEffect(() => {
    setLoading(true);  // Only set loading on mount
    fetchData();
    
    // Connect to SSE for real-time updates
    let eventSource: EventSource | null = null;
    connectSSE().then(source => {
      eventSource = source;
    });
    
    // Fallback polling every 60 seconds (reduced frequency since we have SSE)
    const interval = setInterval(fetchData, 60000);
    
    return () => {
      clearInterval(interval);
      if (eventSource) {
        eventSource.close();
        setSseConnected(false);
      }
    };
  }, [fetchData, connectSSE]);

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    try {
      // Get session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Upload files sequentially to avoid overwhelming the server
      const uploadPromises = selectedFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);

        const response = await fetch('/api/import/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}: ${result.error}`);
        }
        
        return { file: file.name, success: true };
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);
      
      // Show success message
      const successCount = results.filter(r => r.success).length;
      alert(`${successCount} file(s) uploaded successfully! Processing started.`);
      
      // Clear selected files and refresh data
      setSelectedFiles([]);
      fetchData();
      setTimeout(fetchData, 2000);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const handleGenerateProposals = async () => {
    // Check if there are existing proposals
    if (proposals.length > 0) {
      setShowRegenerateConfirm(true);
      return;
    }
    
    // If no existing proposals, generate directly
    await generateProposalsInternal();
  };

  const generateProposalsInternal = async () => {
    setGeneratingProposals(true);
    setError(null);
    setSuccess(null);
    setGenerationProgress(0);
    setGenerationStatus('Initializing...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // First, clear existing proposals if any
      if (proposals.length > 0) {
        setGenerationStatus('Clearing existing proposals...');
        const deleteResponse = await fetch(`/api/projects/${projectId}/proposals`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clearAll: true }),
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          throw new Error(errorData.error || 'Failed to clear existing proposals');
        }
      }

      setGenerationStatus('Starting AI proposal generation...');

      // Then generate new proposals (starts async process)
      const response = await fetch(`/api/projects/${projectId}/generate-proposals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate proposals');
      }

      const result = await response.json();
      const jobId = result.jobId;
      setCurrentJobId(jobId);
      
      console.log('[GENERATE] Proposals generation started with jobId:', jobId);

      // Poll for real progress
      const progressInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/projects/${projectId}/progress/${jobId}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          
          if (progressRes.ok) {
            const progress = await progressRes.json();
            
            // Calculate percentage
            const percentage = progress.total > 0 
              ? Math.round((progress.current / progress.total) * 100) 
              : 0;
            
            setGenerationProgress(percentage);
            setGenerationStatus(progress.message || 'Processing...');
            
            // Check if complete
            if (progress.stage === 'complete') {
              clearInterval(progressInterval);
      
      // Refresh data to show new proposals
              console.log('[GENERATE] Generation complete, fetching updated proposals...');
      await fetchData();
              console.log('[GENERATE] Data fetched, proposals count:', proposals.length);
      
      // Switch to proposals tab to show the results
      setActiveTab('proposals');
              
              // Show success message
              setSuccess(`Generated ${result.nodesGenerated} proposed nodes from ${result.clustersGenerated} clusters`);
              
              // Reset progress
              setGenerationProgress(0);
              setGenerationStatus('');
              setCurrentJobId(null);
              setGeneratingProposals(false);
            } else if (progress.stage === 'error') {
              clearInterval(progressInterval);
              throw new Error(progress.message || 'Generation failed');
            }
          }
        } catch (pollError) {
          console.error('Progress poll error:', pollError);
        }
      }, 1000); // Poll every second

      // Safety timeout - clear interval after 20 minutes
      setTimeout(() => {
        clearInterval(progressInterval);
        if (generatingProposals) {
          setGeneratingProposals(false);
          setError('Generation timed out. Please check the proposals tab to see if any nodes were generated.');
        }
      }, 20 * 60 * 1000);

    } catch (error: any) {
      console.error('Generate proposals error:', error);
      setError(error.message || 'Failed to generate proposals');
      setGeneratingProposals(false);
      setGenerationProgress(0);
      setGenerationStatus('');
      setCurrentJobId(null);
    } finally {
      setShowRegenerateConfirm(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/import/upload?projectId=${projectId}&sourceId=${sourceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete source');
      }

      setSuccess('File deleted successfully');
      await fetchData();
    } catch (error: any) {
      console.error('Delete source error:', error);
      setError(error.message || 'Failed to delete file');
    }
  };

  const handleClearAllProposals = async () => {
    if (!confirm('Are you sure you want to clear all proposals? This action cannot be undone.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/proposals`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clearAll: true }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clear proposals');
      }

      await fetchData();
      setSuccess('All proposals cleared successfully');
    } catch (error: any) {
      console.error('Clear proposals error:', error);
      setError(error.message || 'Failed to clear proposals');
    }
  };

  const handleBuildTree = async () => {
    if (selectedProposals.size === 0) {
      setError('Please select at least one proposal to build the tree');
      return;
    }

    setBuildingTree(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      console.log(`[BUILD TREE] Building tree with ${selectedProposals.size} proposals...`);
      setSuccess(`Building tree with ${selectedProposals.size} nodes... This may take 1-2 minutes.`);

      // Create a 3-minute timeout for tree building
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

      const response = await fetch(`/api/projects/${projectId}/proposals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'accept',
          proposalIds: Array.from(selectedProposals),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to build tree');
      }

      const result = await response.json();
      console.log('[BUILD TREE] Tree created successfully:', result);
      
      setSuccess(`Experiment tree created successfully with ${selectedProposals.size} nodes! Redirecting...`);
      
      // Clear selection
      setSelectedProposals(new Set());
      
      // Navigate to the created tree after brief delay
      if (result.treeId) {
        setTimeout(() => {
        router.push(`/project/${projectId}/trees/${result.treeId}`);
        }, 1500);
      }
    } catch (error: any) {
      console.error('Build tree error:', error);
      if (error.name === 'AbortError') {
        setError('Tree building timed out. The tree may still be creating in the background. Please check your project trees in a few minutes.');
      } else {
      setError(error.message || 'Failed to build tree');
      }
    } finally {
      setBuildingTree(false);
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

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
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
          <div className="flex items-center gap-4 mb-2">
            <Button
              variant="ghost"
              onClick={() => router.push(`/project/${projectId}`)}
              className="mb-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </div>
          <h1 className="text-3xl font-bold">Import Data</h1>
          <p className="text-muted-foreground">
            Upload files or connect repositories to automatically generate experiment nodes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-muted-foreground">
              {sseConnected ? 'Live updates' : 'Polling mode'}
            </span>
          </div>
          <Button onClick={fetchData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="manage">Manage Files</TabsTrigger>
          <TabsTrigger value="proposals">Review Proposals</TabsTrigger>
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
                <Label htmlFor="files">Select Files</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Input
                    id="files"
                    type="file"
                    accept=".pdf,.xlsx,.xls,.mp4,.avi,.mov,.txt,.md"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setSelectedFiles(files);
                    }}
                    className="mb-4"
                  />
                  <p className="text-sm text-muted-foreground">
                    Or drag and drop files here
                  </p>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Selected {selectedFiles.length} file(s):
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                          <span className="truncate flex-1">{file.name}</span>
                          <span className="text-muted-foreground ml-2">
                            {formatFileSize(file.size)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newFiles = selectedFiles.filter((_, i) => i !== index);
                              setSelectedFiles(newFiles);
                            }}
                            className="ml-2 h-6 w-6 p-0"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Total size: {formatFileSize(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFiles([])}
                        className="h-6 px-2 text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              <Button 
                onClick={handleFileUpload} 
                disabled={selectedFiles.length === 0 || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Uploading {selectedFiles.length} file(s)...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : 'Files'}
                  </>
                )}
              </Button>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Supported formats: PDF, Excel (.xlsx, .xls), Video (.mp4, .avi, .mov), Text (.txt, .md)
                  <br />
                  Maximum file size: 100MB per file
                  <br />
                  You can select multiple files at once for batch upload
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

        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Manage Files</CardTitle>
              <CardDescription>
                Review, delete, and manage your uploaded files before generating AI proposals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sources.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No files uploaded yet. Go to the Upload Files tab to get started.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {sources.length} file(s) uploaded
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleClearAllProposals}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Clear All Proposals
                      </Button>
                      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
                        <AlertDialogTrigger asChild>
                          <Button
                            onClick={() => {
                              const completedCount = sources.filter(s => s.status === 'completed').length;
                              if (completedCount === 0) {
                                setError('No completed files found. Please upload files first.');
                                return;
                              }
                              handleGenerateProposals();
                            }}
                            disabled={sources.filter(s => s.status === 'completed').length === 0 || generatingProposals}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {generatingProposals ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            {generatingProposals ? 'Generating...' : 'Generate AI Proposals'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Clear Existing Proposals?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete all existing AI-generated proposals ({proposals.length} proposals) and generate new ones from your uploaded files. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={generateProposalsInternal}>
                              Clear & Generate New Proposals
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        onClick={handleClearAll}
                        disabled={clearing || sources.length === 0}
                        variant="outline"
                      >
                        {clearing ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Clear All
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress Bar for AI Generation */}
                  {generatingProposals && generationStatus && (
                    <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-blue-900 dark:text-blue-100">
                          {generationStatus}
                        </span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {generationProgress}%
                        </span>
                      </div>
                      <Progress value={generationProgress} className="h-2" />
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    {sources.map((source) => (
                      <div key={source.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {source.source_type === 'pdf' && <FileText className="h-5 w-5 text-red-500" />}
                            {source.source_type === 'video' && <Video className="h-5 w-5 text-blue-500" />}
                            {source.source_type === 'excel' && <FileSpreadsheet className="h-5 w-5 text-green-500" />}
                            {source.source_type === 'text' && <FileText className="h-5 w-5 text-gray-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{source.source_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {source.file_size ? formatFileSize(source.file_size) : 'Unknown size'} • 
                              {source.created_at ? new Date(source.created_at).toLocaleDateString() : 'Unknown date'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            source.status === 'completed' ? 'default' :
                            source.status === 'processing' ? 'secondary' :
                            source.status === 'failed' ? 'destructive' : 'outline'
                          }>
                            {source.status}
                          </Badge>
                          <Button
                            onClick={() => handleDeleteSource(source.id)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proposals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review AI Proposals</CardTitle>
              <CardDescription>
                Review and select the AI-generated experiment nodes to build your tree
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Generate AI proposals from the Manage Files tab to see them here.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {proposalsStats?.totalNodes || proposals.length} node(s) • {proposalsStats?.totalBlocks || 0} block(s) • {selectedProposals.size} selected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click on nodes to select/deselect them for tree building
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelectedProposals(new Set(proposals.map(p => p.id)))}
                        variant="outline"
                        size="sm"
                      >
                        Select All
                      </Button>
                      <Button
                        onClick={() => setSelectedProposals(new Set())}
                        variant="outline"
                        size="sm"
                      >
                        Clear Selection
                      </Button>
                      <Button
                        onClick={handleBuildTree}
                        disabled={selectedProposals.size === 0 || buildingTree}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {buildingTree ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Building Tree...
                          </>
                        ) : (
                          <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Build Tree ({selectedProposals.size})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Group proposals by block type and display in order */}
                  {(() => {
                    // Group proposals by node type (normalize to lowercase)
                    const groupedProposals = proposals.reduce((acc, proposal) => {
                      const rawType = proposal.node_json?.metadata?.node_type || 'uncategorized';
                      const blockType = rawType.toLowerCase();
                      if (!acc[blockType]) {
                        acc[blockType] = [];
                      }
                      acc[blockType].push(proposal);
                      return acc;
                    }, {} as Record<string, any[]>);

                    // Format block names for display
                    const formatBlockName = (type: string, partNum?: number, totalParts?: number) => {
                      const nameMap: Record<string, string> = {
                        'protocol': 'Protocol',
                        'analysis': 'Analysis',
                        'results': 'Results',
                        'data_creation': 'Data Creation',
                        'data': 'Data',
                        'software': 'Software',
                        'instrument': 'Instrument',
                        'uncategorized': 'Uncategorized'
                      };
                      const baseName = nameMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      if (partNum && totalParts && totalParts > 1) {
                        return `${baseName} - Part ${partNum}`;
                      }
                      return baseName;
                    };

                    // Split large blocks into smaller sub-blocks (max 15 nodes each)
                    const MAX_NODES_PER_BLOCK = 15;
                    const splitLargeBlocks = (grouped: Record<string, any[]>) => {
                      const result: Array<{ key: string; type: string; nodes: any[]; part?: number; totalParts?: number }> = [];
                      
                      for (const [type, nodes] of Object.entries(grouped)) {
                        if (nodes.length <= MAX_NODES_PER_BLOCK) {
                          result.push({ key: type, type, nodes });
                        } else {
                          const numParts = Math.ceil(nodes.length / MAX_NODES_PER_BLOCK);
                          for (let i = 0; i < numParts; i++) {
                            const start = i * MAX_NODES_PER_BLOCK;
                            const end = Math.min((i + 1) * MAX_NODES_PER_BLOCK, nodes.length);
                            result.push({
                              key: `${type}_part_${i + 1}`,
                              type,
                              nodes: nodes.slice(start, end),
                              part: i + 1,
                              totalParts: numParts
                            });
                          }
                        }
                      }
                      return result;
                    };

                    // Workflow-based ordering (put uncategorized last)
                    const workflowOrder = ['protocol', 'data_creation', 'data', 'analysis', 'results', 'software', 'instrument'];
                    const allBlockTypes = Object.keys(groupedProposals);
                    const orderedTypes = [
                      ...workflowOrder.filter(type => allBlockTypes.includes(type)),
                      ...allBlockTypes.filter(type => !workflowOrder.includes(type))
                    ];
                    
                    // Create ordered grouped object
                    const orderedGrouped: Record<string, any[]> = {};
                    orderedTypes.forEach(type => {
                      orderedGrouped[type] = groupedProposals[type];
                    });
                    
                    const blocksToRender = splitLargeBlocks(orderedGrouped);

                    return (
                      <div className="space-y-6">
                        {blocksToRender.map((block, blockIndex) => (
                          <div key={block.key} className="border rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
                                {blockIndex + 1}
                              </div>
                              <h3 className="text-lg font-semibold">{formatBlockName(block.type, block.part, block.totalParts)} Block</h3>
                              <Badge variant="outline" className="ml-auto">
                                {block.nodes.length} node(s)
                              </Badge>
                            </div>
                            
                            <div className="space-y-3">
                              {block.nodes.map((proposal, nodeIndex) => {
                                const node = proposal.node_json;
                                const isSelected = selectedProposals.has(proposal.id);
                                
                                return (
                                  <div 
                                    key={proposal.id} 
                                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                    onClick={() => {
                                      const newSelected = new Set(selectedProposals);
                                      if (isSelected) {
                                        newSelected.delete(proposal.id);
                                      } else {
                                        newSelected.add(proposal.id);
                                      }
                                      setSelectedProposals(newSelected);
                                    }}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}} // Handled by parent onClick
                                          className="mt-1"
                                        />
                                        <div className="flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                          {nodeIndex + 1}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h4 className="font-medium text-sm">{node.title}</h4>
                                          <Badge 
                                            variant={proposal.confidence > 0.8 ? 'default' : proposal.confidence > 0.6 ? 'secondary' : 'outline'}
                                            className="text-xs"
                                          >
                                            {Math.round(proposal.confidence * 100)}% confidence
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">
                                          {node.short_summary || node.content?.text?.substring(0, 200) + '...'}
                                        </p>
                                        
                                        {/* Detailed node information */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                          <div className="flex items-center gap-1">
                                            <span className="text-muted-foreground">📄 Content:</span>
                                            <span className={node.content?.text ? 'text-green-600' : 'text-red-600'}>
                                              {node.content?.text ? 'Yes' : 'No'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-muted-foreground">🔗 Links:</span>
                                            <span className="font-medium">{node.links?.length || 0}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-muted-foreground">📎 Attachments:</span>
                                            <span className="font-medium">{node.attachments?.length || 0}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-muted-foreground">🏷️ Tags:</span>
                                            <span className="font-medium">{node.metadata?.tags?.length || 0}</span>
                                          </div>
                                        </div>

                                        {/* Show tags if available */}
                                        {node.metadata?.tags && node.metadata.tags.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-1">
                                            {node.metadata.tags.slice(0, 5).map((tag: string, index: number) => (
                                              <Badge key={index} variant="secondary" className="text-xs">
                                                {tag}
                                              </Badge>
                                            ))}
                                            {node.metadata.tags.length > 5 && (
                                              <Badge variant="secondary" className="text-xs">
                                                +{node.metadata.tags.length - 5} more
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
