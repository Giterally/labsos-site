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
import { 
  CheckCircle, 
  XCircle, 
  Loader2,
  RefreshCw,
  Eye,
  Plus,
  FileText,
  Clock,
  AlertTriangle
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

  useEffect(() => {
    setLoading(true);
    fetchProposals();
    // Poll for updates every 30 seconds (reduced frequency)
    const interval = setInterval(fetchProposals, 30000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

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
        // Navigate to the experiment tree
        router.push(`/dashboard/projects/${projectId}/trees/${result.treeId}`);
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
    let nodeType = 'protocol'; // default fallback
    
    if (proposal.node_json.metadata?.tags && Array.isArray(proposal.node_json.metadata.tags)) {
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
    } else if (proposal.node_json.metadata?.node_type) {
      nodeType = proposal.node_json.metadata.node_type.toLowerCase();
    }
    
    if (!groups[nodeType]) {
      groups[nodeType] = [];
    }
    groups[nodeType].push(proposal);
    return groups;
  }, {} as Record<string, typeof proposedProposals>);

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
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {nodes.map((proposal, index) => (
                      <Card key={proposal.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                              <div className="mt-1">
                                <Checkbox
                                  id={`proposal-${proposal.id}`}
                                  checked={selectedProposals.has(proposal.id)}
                                  onCheckedChange={(checked) => handleSelectProposal(proposal.id, checked as boolean)}
                                  className="h-4 w-4 border-2 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                />
                              </div>
                              <div className="flex-1">
                                <CardTitle className="text-base line-clamp-2">
                                  {proposal.node_json.title || proposal.node_json.name || 'Untitled Node'}
                                </CardTitle>
                                <CardDescription className="mt-1 line-clamp-2">
                                  {proposal.node_json.short_summary || proposal.node_json.description || ''}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${getConfidenceColor(proposal.confidence)}`} />
                              <span className="text-xs text-muted-foreground">
                                {Math.round(proposal.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            {/* 4-Slide Content Preview */}
                            <div className="grid grid-cols-2 gap-2">
                              {/* Slide 1: Overview */}
                              <div className="bg-white/50 rounded p-2 border">
                                <h4 className="font-medium text-xs mb-1 text-blue-600">📋 Overview</h4>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {proposal.node_json.content?.text || proposal.node_json.short_summary || 'No overview available'}
                                </p>
                              </div>

                              {/* Slide 2: Steps */}
                              <div className="bg-white/50 rounded p-2 border">
                                <h4 className="font-medium text-xs mb-1 text-green-600">⚡ Steps</h4>
                                {proposal.node_json.content?.structured_steps && proposal.node_json.content.structured_steps.length > 0 ? (
                                  <div className="text-xs text-muted-foreground">
                                    {proposal.node_json.content.structured_steps.length} steps
                                    <div className="mt-1">
                                      {proposal.node_json.content.structured_steps.slice(0, 1).map((step, stepIndex) => (
                                        <div key={stepIndex} className="truncate">
                                          {step.step_no}. {step.action}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No steps defined</p>
                                )}
                              </div>

                              {/* Slide 3: Materials */}
                              <div className="bg-white/50 rounded p-2 border">
                                <h4 className="font-medium text-xs mb-1 text-orange-600">🧪 Materials</h4>
                                <p className="text-xs text-muted-foreground">
                                  {proposal.node_json.metadata?.estimated_time_minutes || 0} min
                                </p>
                                <div className="flex gap-1 mt-1">
                                  {proposal.node_json.metadata?.tags?.slice(0, 2).map((tag, tagIndex) => (
                                    <Badge key={tagIndex} variant="secondary" className="text-xs px-1 py-0">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              {/* Slide 4: Sources */}
                              <div className="bg-white/50 rounded p-2 border">
                                <h4 className="font-medium text-xs mb-1 text-purple-600">📚 Sources</h4>
                                <p className="text-xs text-muted-foreground">
                                  {proposal.node_json.provenance?.sources?.length || 0} chunks
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${getConfidenceColor(proposal.confidence)}`} />
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(proposal.confidence * 100)}% confidence
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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