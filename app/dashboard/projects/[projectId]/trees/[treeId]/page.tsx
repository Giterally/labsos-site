'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  Loader2,
  RefreshCw,
  FileText,
  Link,
  Paperclip,
  Settings,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit,
  Trash2,
  Save,
  X
} from 'lucide-react';

interface TreeBlock {
  id: string;
  name: string;
  description: string;
  position: number;
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  name: string;
  description: string;
  node_type: string;
  position: number;
  provenance: any;
  confidence: number;
  created_at: string;
}

interface ExperimentTree {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  blocks: TreeBlock[];
}

export default function ExperimentTreePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const treeId = params.treeId as string;

  const [tree, setTree] = useState<ExperimentTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchTree = useCallback(async () => {
    try {
      console.log('[FETCH TREE] Starting fetch for tree:', treeId, 'in project:', projectId);
      
      // Get session for API call
      let headers: HeadersInit = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log('[FETCH TREE] Session found, adding auth header');
      } else {
        console.log('[FETCH TREE] No session found');
      }

      // Fetch tree details
      const url = `/api/projects/${projectId}/trees/${treeId}`;
      console.log('[FETCH TREE] Making request to:', url);
      
      const treeResponse = await fetch(url, { headers });
      console.log('[FETCH TREE] Response status:', treeResponse.status, 'ok:', treeResponse.ok);
      
      if (!treeResponse.ok) {
        const errorText = await treeResponse.text();
        console.error('[FETCH TREE] Error response:', errorText);
        throw new Error(`Failed to fetch experiment tree: ${treeResponse.status} ${errorText}`);
      }
      
      const treeData = await treeResponse.json();
      console.log('[FETCH TREE] Tree data received:', {
        id: treeData.tree?.id,
        name: treeData.tree?.name,
        blocksCount: treeData.tree?.blocks?.length || 0
      });
      
      setTree(treeData.tree);
      setEditName(treeData.tree.name);
      setEditDescription(treeData.tree.description);
      setLoading(false);
    } catch (error) {
      console.error('[FETCH TREE] Error fetching tree:', error);
      setError(`Failed to load experiment tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  }, [projectId, treeId]);

  useEffect(() => {
    setLoading(true);
    fetchTree();
  }, [fetchTree]);

  const handleEdit = () => {
    console.log('[HANDLE EDIT] Activating edit mode for tree:', tree?.name);
    setEditing(true);
    setError(null); // Clear any previous errors
  };

  const handleSaveEdit = async () => {
    if (!tree) {
      console.error('[HANDLE SAVE EDIT] No tree data available');
      return;
    }

    console.log('[HANDLE SAVE EDIT] Starting save for tree:', tree.id);
    console.log('[HANDLE SAVE EDIT] New name:', editName);
    console.log('[HANDLE SAVE EDIT] New description:', editDescription);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[HANDLE SAVE EDIT] No session found');
        throw new Error('Not authenticated');
      }

      const url = `/api/projects/${projectId}/trees/${treeId}`;
      const requestBody = {
        name: editName,
        description: editDescription,
      };

      console.log('[HANDLE SAVE EDIT] Making PUT request to:', url);
      console.log('[HANDLE SAVE EDIT] Request body:', requestBody);

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[HANDLE SAVE EDIT] Response status:', response.status);
      console.log('[HANDLE SAVE EDIT] Response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('[HANDLE SAVE EDIT] Success response:', result);
        
        setEditing(false);
        setSuccess('Tree updated successfully!');
        setError(null);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
        
        // Refresh the tree data
        await fetchTree();
      } else {
        const errorText = await response.text();
        console.error('[HANDLE SAVE EDIT] Error response:', errorText);
        
        let errorMessage = 'Failed to update tree';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${errorText}`;
        }
        
        setError(errorMessage);
      }
    } catch (error) {
      console.error('[HANDLE SAVE EDIT] Network or other error:', error);
      setError(`Failed to update tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelEdit = () => {
    console.log('[HANDLE CANCEL EDIT] Cancelling edit mode');
    setEditing(false);
    setEditName(tree?.name || '');
    setEditDescription(tree?.description || '');
    setError(null); // Clear any errors
  };

  const handleDelete = async () => {
    if (!tree) {
      console.error('[HANDLE DELETE] No tree data available');
      return;
    }

    const confirmed = confirm('Are you sure you want to delete this experiment tree? This action cannot be undone.');
    console.log('[HANDLE DELETE] Confirmation result:', confirmed);
    
    if (!confirmed) {
      console.log('[HANDLE DELETE] User cancelled deletion');
      return;
    }

    console.log('[HANDLE DELETE] Starting deletion for tree:', tree.id, tree.name);
    setDeleting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[HANDLE DELETE] No session found');
        throw new Error('Not authenticated');
      }

      const url = `/api/projects/${projectId}/trees/${treeId}`;
      console.log('[HANDLE DELETE] Making DELETE request to:', url);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      console.log('[HANDLE DELETE] Response status:', response.status);
      console.log('[HANDLE DELETE] Response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('[HANDLE DELETE] Success response:', result);
        console.log('[HANDLE DELETE] Redirecting to proposals page');
        
        // Redirect to proposals page
        router.push(`/dashboard/projects/${projectId}/proposals`);
      } else {
        const errorText = await response.text();
        console.error('[HANDLE DELETE] Error response:', errorText);
        
        let errorMessage = 'Failed to delete tree';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${errorText}`;
        }
        
        setError(errorMessage);
      }
    } catch (error) {
      console.error('[HANDLE DELETE] Network or other error:', error);
      setError(`Failed to delete tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
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

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading experiment tree...</span>
        </div>
      </div>
    );
  }

  if (error || !tree) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error || 'Experiment tree not found'}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/projects/${projectId}/proposals`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Proposals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Success Alert */}
      {success && (
        <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/projects/${projectId}/proposals`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Proposals
          </Button>
          <div>
            {editing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-3xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-muted-foreground bg-transparent border-b border-gray-300 focus:outline-none w-full"
                />
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold">{tree.name}</h1>
                <p className="text-muted-foreground">{tree.description}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                onClick={handleSaveEdit}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                variant="outline"
                onClick={handleCancelEdit}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleEdit}
                className="hover:bg-blue-50"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="hover:bg-red-600"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={fetchTree}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tree Overview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Experiment Tree Overview</CardTitle>
          <CardDescription>
            This tree contains {tree.blocks.length} blocks with {tree.blocks.reduce((total, block) => total + block.nodes.length, 0)} total nodes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{tree.blocks.length}</div>
              <div className="text-sm text-muted-foreground">Blocks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{tree.blocks.reduce((total, block) => total + block.nodes.length, 0)}</div>
              <div className="text-sm text-muted-foreground">Nodes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {Math.round(tree.blocks.reduce((total, block) => 
                  total + block.nodes.reduce((nodeTotal, node) => nodeTotal + node.confidence, 0), 0
                ) / tree.blocks.reduce((total, block) => total + block.nodes.length, 0) * 100)}%
              </div>
              <div className="text-sm text-muted-foreground">Avg Confidence</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blocks and Nodes */}
      <div className="space-y-6">
        {tree.blocks.map((block) => (
          <Card key={block.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                {block.name}
              </CardTitle>
              <CardDescription>{block.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {block.nodes.map((node) => (
                  <Card key={node.id} className="border-l-4 border-l-blue-500">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{node.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {node.description}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {node.node_type}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${getConfidenceColor(node.confidence)}`} />
                            <span className="text-sm text-muted-foreground">
                              {getConfidenceLabel(node.confidence)} ({Math.round(node.confidence * 100)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="content" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="content" className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Content
                          </TabsTrigger>
                          <TabsTrigger value="links" className="flex items-center gap-2">
                            <Link className="h-4 w-4" />
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
                            <h4 className="font-medium">Content</h4>
                            <p className="text-sm text-muted-foreground">
                              {node.provenance?.sources?.length > 0 
                                ? `Generated from ${node.provenance.sources.length} source chunks`
                                : 'No content details available'
                              }
                            </p>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="links" className="mt-4">
                          <div className="space-y-2">
                            <h4 className="font-medium">Links</h4>
                            <p className="text-sm text-muted-foreground">
                              Links and references will be displayed here
                            </p>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="attachments" className="mt-4">
                          <div className="space-y-2">
                            <h4 className="font-medium">Attachments</h4>
                            <p className="text-sm text-muted-foreground">
                              File attachments and resources will be displayed here
                            </p>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="metadata" className="mt-4">
                          <div className="space-y-2">
                            <h4 className="font-medium">Metadata</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium">Type:</span> {node.node_type}
                              </div>
                              <div>
                                <span className="font-medium">Confidence:</span> {Math.round(node.confidence * 100)}%
                              </div>
                              <div>
                                <span className="font-medium">Created:</span> {new Date(node.created_at).toLocaleDateString()}
                              </div>
                              <div>
                                <span className="font-medium">Sources:</span> {node.provenance?.sources?.length || 0}
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
