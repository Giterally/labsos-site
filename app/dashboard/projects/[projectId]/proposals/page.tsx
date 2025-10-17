'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  Loader2,
  RefreshCw,
  Eye,
  Plus,
  FileText,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Paperclip,
  Link as LinkIcon,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ProposedNode {
  id: string;
  node_json: {
    title: string;
    short_summary: string;
    content: {
      text: string;
      structured_steps: Array<{
        step_no: number;
        action: string;
        params: Record<string, any>;
      }>;
    };
    metadata: {
      node_type: string;
      tags: string[];
      status: string;
      parameters: Record<string, any>;
      estimated_time_minutes: number;
    };
    links: Array<{
      type: string;
      url: string;
      desc: string;
    }>;
    attachments: Array<{
      id: string;
      name: string;
      range?: string;
    }>;
    provenance: {
      sources: Array<{
        chunk_id: string;
        source_type: string;
        snippet: string;
        offset: number;
      }>;
      generated_by: string;
      confidence: number;
    };
  };
  status: string;
  confidence: number;
  provenance: any;
  created_at: string;
  updated_at: string;
}

export default function ProposalsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [proposals, setProposals] = useState<ProposedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedTreeId, setCompletedTreeId] = useState<string | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [deletingProposal, setDeletingProposal] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [expandedProposals, setExpandedProposals] = useState<Set<string>>(new Set());

  const fetchProposals = useCallback(async () => {
    try {
      // Get session for API call
      let headers: HeadersInit = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`/api/projects/${projectId}/proposals`, { 
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proposals: ${response.status}`);
      }
      const data = await response.json();
      setProposals(data.proposals || []);
      setError(null); // Clear any previous errors
      setLoading(false);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Failed to load proposals. Please refresh the page.');
      }
      setLoading(false);
    }
  }, [projectId]);

  // SSE connection for real-time updates
  const connectSSE = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log('No session token available for SSE connection (proposals)');
      return null;
    }

    // Check if token is expired (JWT tokens typically expire in 1 hour)
    const tokenPayload = JSON.parse(atob(session.access_token.split('.')[1]));
    const tokenExpiry = tokenPayload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    
    if (tokenExpiry - now < 60000) { // If token expires in less than 1 minute
      console.log('Token expires soon, refreshing session (proposals)');
      const { data: { session: newSession } } = await supabase.auth.refreshSession();
      if (!newSession?.access_token) {
        console.log('Failed to refresh session for SSE (proposals)');
        return null;
      }
      session.access_token = newSession.access_token;
    }

    // EventSource doesn't support custom headers, so we need to pass the token as a query parameter
    const eventSource = new EventSource(`/api/projects/${projectId}/status?token=${encodeURIComponent(session.access_token)}`);

    eventSource.onopen = () => {
      console.log('SSE connection opened (proposals)');
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE message received (proposals):', data);

        switch (data.type) {
          case 'connected':
          case 'subscribed':
            console.log('SSE (proposals):', data.message);
            break;
          
          case 'new_proposal':
          case 'proposal_update':
            console.log('Proposal update (proposals):', data);
            // Refresh proposals when they change
            fetchProposals();
            break;
          
          case 'proposal_deleted':
            console.log('Proposal deleted (proposals):', data);
            // Remove from selected if it was selected
            setSelectedProposals(prev => {
              const newSelected = new Set(prev);
              newSelected.delete(data.proposalId);
              return newSelected;
            });
            // Refresh proposals
            fetchProposals();
            break;
          
          case 'heartbeat':
            // Keep connection alive
            break;
          
          default:
            console.log('Unknown SSE message type (proposals):', data.type);
        }
      } catch (error) {
        console.error('Error parsing SSE message (proposals):', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error (proposals):', error);
      setSseConnected(false);
      
      // Close the current connection
      eventSource.close();
      
      // Attempt to reconnect after 5 seconds, but only if we're still on the page
      setTimeout(async () => {
        try {
          console.log('Attempting to reconnect SSE (proposals)...');
          const newEventSource = await connectSSE();
          if (!newEventSource) {
            console.log('Failed to reconnect SSE (proposals), will retry in 30 seconds');
            setTimeout(() => connectSSE(), 30000);
          }
        } catch (reconnectError) {
          console.error('SSE reconnection failed (proposals):', reconnectError);
          // Retry again in 30 seconds
          setTimeout(() => connectSSE(), 30000);
        }
      }, 5000);
    };

    return eventSource;
  }, [projectId, fetchProposals]);

  useEffect(() => {
    setLoading(true);
    fetchProposals();
    
    // Connect to SSE for real-time updates
    const eventSource = connectSSE();
    
    // Fallback polling every 60 seconds (reduced frequency since we have SSE)
    const interval = setInterval(fetchProposals, 60000);
    
    return () => {
      clearInterval(interval);
      if (eventSource) {
        eventSource.close();
        setSseConnected(false);
      }
    };
  }, [fetchProposals, connectSSE]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchProposals();
    } finally {
      setRefreshing(false);
    }
  }, [fetchProposals]);

  const handleSelectProposal = (proposalId: string, checked: boolean) => {
    const newSelected = new Set(selectedProposals);
    if (checked) {
      newSelected.add(proposalId);
    } else {
      newSelected.delete(proposalId);
    }
    setSelectedProposals(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = proposals
        .filter(p => p.status === 'proposed')
        .map(p => p.id);
      setSelectedProposals(new Set(allIds));
    } else {
      setSelectedProposals(new Set());
    }
  };

  const handleBuildTree = async () => {
    if (selectedProposals.size === 0) {
      setError('Please select at least one proposal to build the tree');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Get session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'accept',
          proposalIds: Array.from(selectedProposals),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Show completion page with navigation options
        setCompletedTreeId(result.treeId);
        setShowCompletion(true);
      } else {
        setError(result.error || 'Failed to build tree');
      }
    } catch (error) {
      console.error('Build tree error:', error);
      setError('Failed to build tree');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedProposals.size === 0) {
      setError('Please select at least one proposal to reject');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Get session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'reject',
          proposalIds: Array.from(selectedProposals),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSelectedProposals(new Set());
        fetchProposals(); // Refresh the list
      } else {
        setError(result.error || 'Failed to reject proposals');
      }
    } catch (error) {
      console.error('Reject proposals error:', error);
      setError('Failed to reject proposals');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteProposal = async (proposalId: string) => {
    if (!confirm('Are you sure you want to delete this proposal? This action cannot be undone.')) {
      return;
    }

    setDeletingProposal(proposalId);
    setError(null);

    try {
      // Get session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/projects/${projectId}/proposals`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          proposalIds: [proposalId],
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Remove from selected if it was selected
        const newSelected = new Set(selectedProposals);
        newSelected.delete(proposalId);
        setSelectedProposals(newSelected);
        
        // Refresh the list
        fetchProposals();
      } else {
        setError(result.error || 'Failed to delete proposal');
      }
    } catch (error) {
      console.error('Delete proposal error:', error);
      setError('Failed to delete proposal');
    } finally {
      setDeletingProposal(null);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const getBlockIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'protocol':
        return '🧪';
      case 'analysis':
        return '📊';
      case 'results':
        return '📈';
      case 'data_creation':
        return '🗃️';
      default:
        return '📄';
    }
  };

  const getBlockColor = (nodeType: string) => {
    switch (nodeType) {
      case 'protocol':
        return 'border-blue-200 bg-blue-50';
      case 'analysis':
        return 'border-purple-200 bg-purple-50';
      case 'results':
        return 'border-green-200 bg-green-50';
      case 'data_creation':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const proposedProposals = proposals.filter(p => p.status === 'proposed');
  const acceptedProposals = proposals.filter(p => p.status === 'accepted');
  const rejectedProposals = proposals.filter(p => p.status === 'rejected');

  // Group proposed nodes by type (like the tree building logic)
  const nodeTypeGroups = proposedProposals.reduce((groups, proposal) => {
    // Determine node type from tags or fallback to a default
    let nodeType = 'uncategorized'; // default fallback
    
    // Try to get node_type from metadata first
    if (proposal.node_json.metadata?.node_type) {
      const rawType = proposal.node_json.metadata.node_type.toLowerCase();
      // Map common variations to valid types
      if (rawType === 'protocol' || rawType === 'method' || rawType === 'procedure') {
        nodeType = 'protocol';
      } else if (rawType === 'analysis' || rawType === 'processing' || rawType === 'computation') {
        nodeType = 'analysis';
      } else if (rawType === 'results' || rawType === 'result' || rawType === 'findings' || rawType === 'conclusions') {
        nodeType = 'results';
      } else if (rawType === 'data' || rawType === 'data_creation' || rawType === 'materials' || rawType === 'equipment') {
        nodeType = 'data_creation';
      } else {
        // If none match, keep as uncategorized but log it
        console.log(`[PROPOSALS] Unknown node_type: ${rawType} for proposal ${proposal.id}`);
      }
    } 
    // Fallback to checking tags if node_type is not available
    else if (proposal.node_json.metadata?.tags && Array.isArray(proposal.node_json.metadata.tags)) {
      const tags = proposal.node_json.metadata.tags;
      if (tags.includes('protocol') || tags.includes('method') || tags.includes('procedure')) {
        nodeType = 'protocol';
      } else if (tags.includes('analysis') || tags.includes('processing') || tags.includes('computation')) {
        nodeType = 'analysis';
      } else if (tags.includes('results') || tags.includes('findings') || tags.includes('conclusions')) {
        nodeType = 'results';
      } else if (tags.includes('data') || tags.includes('materials') || tags.includes('equipment')) {
        nodeType = 'data_creation';
      }
    }
    
    if (!groups[nodeType]) {
      groups[nodeType] = [];
    }
    groups[nodeType].push(proposal);
    return groups;
  }, {} as Record<string, typeof proposedProposals>);

  // Log grouping summary
  console.log('[PROPOSALS] Grouped proposals:', Object.entries(nodeTypeGroups).map(([type, nodes]) => 
    `${type}: ${nodes.length}`
  ).join(', '));

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading proposals...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button onClick={handleManualRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show completion page after successful tree creation
  if (showCompletion && completedTreeId) {
    return (
      <div className="container mx-auto p-6">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold">Experiment Tree Created!</h1>
            <p className="text-muted-foreground text-lg">
              Your AI-generated experiment tree has been successfully created with {selectedProposals.size} nodes.
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            <Button
              onClick={() => router.push(`/project/${projectId}/trees/${completedTreeId}`)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Experiment Tree
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/project/${projectId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </div>

          <div className="mt-8 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">What's next?</h3>
            <p className="text-sm text-muted-foreground">
              You can now edit your experiment tree, add more nodes, reorder blocks, and customize the workflow to fit your research needs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Proposed Experiment Nodes</h1>
          <p className="text-muted-foreground">
            Review AI-generated experiment nodes and build your experiment tree
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-muted-foreground">
              {sseConnected ? 'Live updates' : 'Polling mode'}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Proposed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proposedProposals.length}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Blocks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{Object.keys(nodeTypeGroups).length}</div>
            <p className="text-xs text-muted-foreground">
              {Object.entries(nodeTypeGroups).map(([type, nodes]) => `${type} (${nodes.length})`).join(', ')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{acceptedProposals.length}</div>
            <p className="text-xs text-muted-foreground">
              Added to trees
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejectedProposals.length}</div>
            <p className="text-xs text-muted-foreground">
              Not used
            </p>
          </CardContent>
        </Card>
      </div>

      {proposedProposals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Proposed Nodes</h3>
            <p className="text-muted-foreground text-center mb-4">
              Upload some files to generate experiment nodes, or check back later as processing completes.
            </p>
            <Button onClick={() => router.push(`/dashboard/projects/${projectId}/import`)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bulk Actions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Bulk Actions</CardTitle>
              <CardDescription>
                Select proposals to accept or reject in bulk
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedProposals.size === proposedProposals.length && proposedProposals.length > 0}
                    onCheckedChange={handleSelectAll}
                    className="h-5 w-5 border-2 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select All ({proposedProposals.length})
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleBuildTree}
                    disabled={selectedProposals.size === 0 || processing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Build Tree ({selectedProposals.size})
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRejectSelected}
                    disabled={selectedProposals.size === 0 || processing}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject ({selectedProposals.size})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Block-Based Proposals View */}
          <div className="space-y-6">
            {Object.entries(nodeTypeGroups).map(([nodeType, nodes]) => (
              <Card key={nodeType} className={`${getBlockColor(nodeType)} border-2`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getBlockIcon(nodeType)}</span>
                      <div>
                        <CardTitle className="text-xl capitalize">
                          {nodeType.replace('_', ' ')} Block
                        </CardTitle>
                        <CardDescription>
                          {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} • 
                          {nodes.reduce((sum, node) => sum + (node.node_json.metadata?.estimated_time_minutes || 0), 0)} min total
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const allNodeIds = nodes.map(n => n.id);
                          const allSelected = allNodeIds.every(id => selectedProposals.has(id));
                          if (allSelected) {
                            allNodeIds.forEach(id => selectedProposals.delete(id));
                          } else {
                            allNodeIds.forEach(id => selectedProposals.add(id));
                          }
                          setSelectedProposals(new Set(selectedProposals));
                        }}
                      >
                        {nodes.every(n => selectedProposals.has(n.id)) ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {nodes.map((proposal, index) => {
                      const isExpanded = expandedProposals.has(proposal.id);
                      const node = proposal.node_json;
                      
                      return (
                      <Card key={proposal.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3 flex-1">
                              <div className="mt-1">
                                <Checkbox
                                  id={`proposal-${proposal.id}`}
                                  checked={selectedProposals.has(proposal.id)}
                                  onCheckedChange={(checked) => handleSelectProposal(proposal.id, checked as boolean)}
                                  className="h-4 w-4 border-2 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                />
                              </div>
                                <div className="flex-1 min-w-0">
                                <CardTitle className="text-base line-clamp-2">
                                    {node.title || 'Untitled Node'}
                                </CardTitle>
                                <CardDescription className="mt-1 line-clamp-2">
                                    {node.short_summary || node.description || 'No description available'}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${getConfidenceColor(proposal.confidence)}`} />
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(proposal.confidence * 100)}%
                                </span>
                              </div>
                                <Button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedProposals);
                                    if (isExpanded) {
                                      newExpanded.delete(proposal.id);
                                    } else {
                                      newExpanded.add(proposal.id);
                                    }
                                    setExpandedProposals(newExpanded);
                                  }}
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              <Button
                                onClick={() => handleDeleteProposal(proposal.id)}
                                variant="ghost"
                                size="sm"
                                disabled={deletingProposal === proposal.id}
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                              >
                                {deletingProposal === proposal.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                          
                          {isExpanded && (
                        <CardContent className="pt-0">
                              <Tabs defaultValue="content" className="w-full">
                                <TabsList className="grid w-full grid-cols-4">
                                  <TabsTrigger value="content" className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Content
                                  </TabsTrigger>
                                  <TabsTrigger value="links" className="flex items-center gap-2">
                                    <LinkIcon className="h-4 w-4" />
                                    Links
                                  </TabsTrigger>
                                  <TabsTrigger value="attachments" className="flex items-center gap-2">
                                    <Paperclip className="h-4 w-4" />
                                    Attachments
                                  </TabsTrigger>
                                  <TabsTrigger value="metadata" className="flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Metadata
                                  </TabsTrigger>
                                </TabsList>
                                
                                <TabsContent value="content" className="mt-4">
                                  <div className="space-y-2">
                                    <h4 className="font-medium text-sm">Content</h4>
                                    {node.content?.text ? (
                                      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded p-3 max-h-96 overflow-y-auto">
                                        {node.content.text}
                              </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">No content available</p>
                                    )}
                                    
                                    {node.content?.structured_steps && node.content.structured_steps.length > 0 && (
                                      <div className="mt-4">
                                        <h5 className="font-medium text-sm mb-2">Steps</h5>
                                        <div className="space-y-2">
                                          {node.content.structured_steps.map((step, idx) => (
                                            <div key={idx} className="text-sm border-l-2 border-primary pl-3">
                                              <span className="font-medium">{step.step_no}.</span> {step.action}
                                              {step.params && Object.keys(step.params).length > 0 && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                  {Object.entries(step.params).map(([key, value]) => (
                                                    <div key={key}>{key}: {String(value)}</div>
                                                  ))}
                                                </div>
                                              )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                    )}
                                  </div>
                                </TabsContent>
                                
                                <TabsContent value="links" className="mt-4">
                                  <div className="space-y-2">
                                    <h4 className="font-medium text-sm">Links</h4>
                                    {node.links && node.links.length > 0 ? (
                                      <div className="space-y-2">
                                        {node.links.map((link, idx) => (
                                          <div key={idx} className="p-3 border rounded bg-muted/50">
                                            <div className="flex items-start justify-between">
                                              <div className="flex-1">
                                                <p className="font-medium text-sm">{link.type || 'Link'}</p>
                                                {link.desc && (
                                                  <p className="text-xs text-muted-foreground mt-1">{link.desc}</p>
                                                )}
                                              </div>
                                            </div>
                                            <a 
                                              href={link.url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 hover:underline mt-1 block truncate"
                                            >
                                              {link.url}
                                            </a>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">No links available</p>
                                )}
                              </div>
                                </TabsContent>
                                
                                <TabsContent value="attachments" className="mt-4">
                                  <div className="space-y-2">
                                    <h4 className="font-medium text-sm">Attachments</h4>
                                    {node.attachments && node.attachments.length > 0 ? (
                                      <div className="space-y-2">
                                        {node.attachments.map((attachment, idx) => (
                                          <div key={idx} className="p-3 border rounded bg-muted/50">
                                            <div className="flex items-center gap-2">
                                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                                              <div className="flex-1">
                                                <p className="font-medium text-sm">{attachment.name}</p>
                                                {attachment.range && (
                                                  <p className="text-xs text-muted-foreground">Range: {attachment.range}</p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">No attachments available</p>
                                    )}
                                  </div>
                                </TabsContent>
                                
                                <TabsContent value="metadata" className="mt-4">
                                  <div className="space-y-3">
                                    <h4 className="font-medium text-sm">Metadata</h4>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Node Type:</span>
                                        <p className="font-medium">{node.metadata?.node_type || 'Not specified'}</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Status:</span>
                                        <p className="font-medium">{node.metadata?.status || 'Not specified'}</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Estimated Time:</span>
                                        <p className="font-medium">{node.metadata?.estimated_time_minutes || 0} minutes</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Confidence:</span>
                                        <p className="font-medium">{Math.round(proposal.confidence * 100)}%</p>
                                      </div>
                                    </div>
                                    
                                    {node.metadata?.tags && node.metadata.tags.length > 0 && (
                                      <div>
                                        <span className="text-sm text-muted-foreground">Tags:</span>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {node.metadata.tags.map((tag, idx) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                                    )}
                                    
                                    {node.metadata?.parameters && Object.keys(node.metadata.parameters).length > 0 && (
                                      <div>
                                        <span className="text-sm text-muted-foreground">Parameters:</span>
                                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono max-h-48 overflow-y-auto">
                                          {JSON.stringify(node.metadata.parameters, null, 2)}
                                </div>
                              </div>
                                    )}
                                    
                                    {node.provenance?.sources && node.provenance.sources.length > 0 && (
                                      <div>
                                        <span className="text-sm text-muted-foreground">Source Chunks:</span>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Generated from {node.provenance.sources.length} source chunk(s)
                                        </p>
                            </div>
                                    )}
                          </div>
                                </TabsContent>
                              </Tabs>
                        </CardContent>
                          )}
                      </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}