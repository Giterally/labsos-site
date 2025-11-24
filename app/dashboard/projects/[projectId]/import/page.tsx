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
import { toast } from '@/lib/toast';
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
  Loader2,
  Square,
  ChevronDown,
  Info,
  GitBranch,
  Link,
  Paperclip,
  Settings
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProviderConnector from '@/components/cloud-storage/ProviderConnector';
import CloudFilePicker from '@/components/cloud-storage/CloudFilePicker';
import SelectedCloudFilesList from '@/components/cloud-storage/SelectedCloudFilesList';

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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  const [selectedSourcesForProposals, setSelectedSourcesForProposals] = useState<Set<string>>(new Set()); // Files selected for proposal generation
  const [clearing, setClearing] = useState(false);
  const [generatingProposals, setGeneratingProposals] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalsStats, setProposalsStats] = useState<{ totalNodes: number; totalBlocks: number; blockBreakdown: { type: string; count: number }[] } | null>(null);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [selectedDetailView, setSelectedDetailView] = useState<Record<string, string>>({});
  const [openNestedTrees, setOpenNestedTrees] = useState<Set<string>>(new Set());
  const [nestedTreeData, setNestedTreeData] = useState<Record<string, any>>({});
  const [loadingNestedTrees, setLoadingNestedTrees] = useState<Set<string>>(new Set());
  const [expandedNestedBlocks, setExpandedNestedBlocks] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('upload');
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [buildingTree, setBuildingTree] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  
  // Cloud storage state
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<'googledrive' | 'onedrive' | 'dropbox' | 'sharepoint' | null>(null);
  const [selectedCloudFiles, setSelectedCloudFiles] = useState<any[]>([]);
  const [cloudImporting, setCloudImporting] = useState(false);
  
  // Progress tracking state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  // localStorage utilities for cross-tab persistence
  const STORAGE_KEY = 'active_proposal_job';
  const getStoredJobId = (projectId: string) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`${STORAGE_KEY}_${projectId}`);
  };
  const storeJobId = (projectId: string, jobId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`${STORAGE_KEY}_${projectId}`, jobId);
  };
  const clearStoredJobId = (projectId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${STORAGE_KEY}_${projectId}`);
  };
  
  // Tree building progress state
  const [treeBuildProgress, setTreeBuildProgress] = useState(0);
  const [treeBuildStatus, setTreeBuildStatus] = useState('');
  const [treeBuildJobId, setTreeBuildJobId] = useState<string | null>(null);
  
  // localStorage utilities for tree building cross-tab persistence
  const TREE_STORAGE_KEY = 'active_tree_build_job';
  const getStoredTreeJobId = (projectId: string) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`${TREE_STORAGE_KEY}_${projectId}`);
  };
  const storeTreeJobId = (projectId: string, jobId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`${TREE_STORAGE_KEY}_${projectId}`, jobId);
  };
  const clearStoredTreeJobId = (projectId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${TREE_STORAGE_KEY}_${projectId}`);
  };

  // Function to fetch nested tree data
  const fetchNestedTreeData = useCallback(async (proposalId: string) => {
    if (nestedTreeData[proposalId]) {
      // Already fetched, just toggle
      const newOpen = new Set(openNestedTrees);
      if (newOpen.has(proposalId)) {
        newOpen.delete(proposalId);
      } else {
        newOpen.add(proposalId);
      }
      setOpenNestedTrees(newOpen);
      return;
    }

    // Start loading
    setLoadingNestedTrees(prev => new Set(prev).add(proposalId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/projects/${projectId}/proposals/${proposalId}/nested-tree`, {
        headers
      });

      console.log('[NESTED_TREE_FETCH] Response status:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      const data = await response.json();
      
      console.log('[NESTED_TREE_FETCH] Raw response data:', {
        dataType: typeof data,
        dataKeys: Object.keys(data || {}),
        fullData: JSON.stringify(data).substring(0, 2000),
        hasProposals: 'proposals' in (data || {}),
        hasBlocks: 'blocks' in (data || {}),
        proposalsType: typeof data?.proposals,
        proposalsIsArray: Array.isArray(data?.proposals),
        proposalsLength: data?.proposals?.length,
        blocksType: typeof data?.blocks,
        blocksIsArray: Array.isArray(data?.blocks),
        blocksLength: data?.blocks?.length
      });
      
      // Even if response is not ok, use the data if it has the expected structure
      // This handles cases where API returns error but still includes proposals/blocks arrays
      if (!response.ok && (!data.proposals && !data.blocks)) {
        console.error('[NESTED_TREE_FETCH] Failed to fetch nested tree data:', data.error || 'Unknown error');
        throw new Error(data.error || 'Failed to fetch nested tree data');
      }

      console.log('[NESTED_TREE_FETCH] Processed data:', {
        hasBlocks: !!data.blocks,
        blocksCount: data.blocks?.length || 0,
        blocksArray: data.blocks?.map((b: any) => ({
          id: b.id,
          name: b.name,
          block_type: b.block_type,
          proposalCount: b.proposals?.length || 0
        })) || [],
        hasProposals: !!data.proposals,
        proposalsCount: data.proposals?.length || 0,
        proposalsArray: data.proposals?.map((p: any) => ({
          id: p.id,
          title: p.node_json?.title,
          nodeType: p.node_json?.metadata?.node_type
        })) || [],
        hasError: !!data.error,
        error: data.error
      });
      
      // Always set the data, even if there's an error (it might have empty arrays)
      const processedData = {
        proposals: data.proposals || [],
        blocks: data.blocks || [],
        isProposed: data.isProposed !== false,
        error: data.error
      };
      
      console.log('[NESTED_TREE_FETCH] Setting state with processed data:', {
        proposalId,
        processedData: {
          proposalsCount: processedData.proposals.length,
          blocksCount: processedData.blocks.length,
          proposals: processedData.proposals.map((p: any) => ({
            id: p.id,
            title: p.node_json?.title
          })),
          blocks: processedData.blocks.map((b: any) => ({
            id: b.id,
            name: b.name,
            proposalCount: b.proposals?.length || 0
          }))
        }
      });
      
      setNestedTreeData(prev => {
        const newData = { ...prev, [proposalId]: processedData };
        console.log('[NESTED_TREE_FETCH] Updated nestedTreeData state:', {
          proposalId,
          hasData: !!newData[proposalId],
          dataKeys: Object.keys(newData[proposalId] || {}),
          proposalsCount: newData[proposalId]?.proposals?.length || 0,
          blocksCount: newData[proposalId]?.blocks?.length || 0
        });
        return newData;
      });
      setOpenNestedTrees(prev => new Set(prev).add(proposalId));
    } catch (error) {
      console.error('Error fetching nested tree data:', error);
    } finally {
      setLoadingNestedTrees(prev => {
        const newSet = new Set(prev);
        newSet.delete(proposalId);
        return newSet;
      });
    }
  }, [projectId, nestedTreeData, openNestedTrees]);

  // Function to render nested tree structure
  const renderNestedTree = useCallback((treeData: any, proposalId: string) => {
    console.log('[RENDER_NESTED_TREE] Rendering tree data:', {
      hasTree: !!treeData.tree,
      hasBlocks: !!treeData.blocks,
      blocksCount: treeData.blocks?.length || 0,
      hasProposals: !!treeData.proposals,
      proposalsCount: treeData.proposals?.length || 0,
      treeData
    });
    if (!treeData) return null;

    // If tree is built, show blocks and nodes
    if (treeData.tree && treeData.blocks && treeData.nodes) {
      const treeDescription = treeData.description || '';
      return (
        <div className="space-y-3">
          {treeDescription && (
            <div className="pb-3 border-b">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{treeDescription}</p>
            </div>
          )}
          {treeData.blocks.map((block: any, blockIndex: number) => {
            const blockKey = `${block.id}_${proposalId}`;
            const isBlockExpanded = expandedNestedBlocks.has(blockKey);
            const blockNodes = treeData.nodes.filter((n: any) => n.block_id === block.id);

            return (
              <div key={block.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newExpanded = new Set(expandedNestedBlocks);
                    if (isBlockExpanded) {
                      newExpanded.delete(blockKey);
                    } else {
                      newExpanded.add(blockKey);
                    }
                    setExpandedNestedBlocks(newExpanded);
                  }}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium">
                    {blockIndex + 1}
                  </div>
                  <h4 className="text-sm font-medium flex-1">{block.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {blockNodes.length} node(s)
                  </Badge>
                  <ChevronDown 
                    className={`w-3 h-3 transition-transform ${isBlockExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
                {isBlockExpanded && (
                  <div className="px-2 pb-2 space-y-3">
                    {blockNodes.map((node: any, nodeIndex: number) => {
                      const contentText = node.content || node.description || '';
                      const description = node.description || '';
                      
                      return (
                        <Card key={node.id} className="text-xs w-full" onClick={(e) => e.stopPropagation()}>
                          <CardHeader className="pb-0 min-w-0">
                            <CardTitle className="text-sm">{node.name}</CardTitle>
                          </CardHeader>
                          <CardContent onClick={(e) => e.stopPropagation()}>
                            <Tabs defaultValue="content" className="w-full" onClick={(e) => e.stopPropagation()}>
                              <TabsList className="grid w-full grid-cols-4 h-8 !bg-gray-100 dark:!bg-transparent" onClick={(e) => e.stopPropagation()}>
                                <TabsTrigger value="content" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <FileText className="h-3 w-3" />
                                  Content
                                </TabsTrigger>
                                <TabsTrigger value="links" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Link className="h-3 w-3" />
                                  Links
                                </TabsTrigger>
                                <TabsTrigger value="attachments" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Paperclip className="h-3 w-3" />
                                  Attachments
                                </TabsTrigger>
                                <TabsTrigger value="metadata" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Settings className="h-3 w-3" />
                                  Metadata
                                </TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="content" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  {contentText ? (
                                    <p className="text-xs !text-foreground whitespace-pre-wrap">
                                      {contentText}
                                    </p>
                                  ) : (
                                    <p className="text-xs !text-foreground italic">
                                      No content available
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="links" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    Links and references will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="attachments" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    File attachments and resources will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="metadata" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="font-medium !text-foreground">Type:</span>{' '}
                                      <span className="!text-foreground">{node.node_type || 'uncategorized'}</span>
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                            </Tabs>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Show nested tree proposals organized by blocks (expandable format)
    // Use blocks structure if available (from API), otherwise group proposals manually
    if (treeData.blocks && Array.isArray(treeData.blocks) && treeData.blocks.length > 0) {
      // Use the blocks structure returned by API
      const treeDescription = treeData.description || '';
      return (
        <div className="space-y-3">
          {treeDescription && (
            <div className="pb-3 border-b">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{treeDescription}</p>
            </div>
          )}
          {treeData.blocks.map((block: any, blockIndex: number) => {
            const blockKey = `nested_proposal_block_${proposalId}_${block.block_type || blockIndex}`;
            const isBlockExpanded = expandedNestedBlocks.has(blockKey);
            const blockProposals = block.proposals || [];

            return (
              <div key={block.id || blockIndex} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newExpanded = new Set(expandedNestedBlocks);
                    if (isBlockExpanded) {
                      newExpanded.delete(blockKey);
                    } else {
                      newExpanded.add(blockKey);
                    }
                    setExpandedNestedBlocks(newExpanded);
                  }}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium">
                    {blockIndex + 1}
                  </div>
                  <h4 className="text-sm font-medium flex-1 text-gray-900 dark:text-gray-100">{block.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {blockProposals.length} node(s)
                  </Badge>
                  <ChevronDown 
                    className={`w-3 h-3 transition-transform text-gray-600 dark:text-gray-400 ${isBlockExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
                {isBlockExpanded && (
                  <div className="px-2 pb-2 space-y-3">
                    {blockProposals.map((proposal: any, nodeIndex: number) => {
                      const node = proposal.node_json;
                      const contentText = typeof node.content === 'string' ? node.content : node.content?.text || '';
                      const description = node.short_summary || node.description || '';
                      
                      return (
                        <Card key={proposal.id} className="text-xs w-full" onClick={(e) => e.stopPropagation()}>
                          <CardHeader className="pb-0 min-w-0">
                            <CardTitle className="text-sm">{node.title}</CardTitle>
                          </CardHeader>
                          <CardContent onClick={(e) => e.stopPropagation()}>
                            <Tabs defaultValue="content" className="w-full" onClick={(e) => e.stopPropagation()}>
                              <TabsList className="grid w-full grid-cols-4 h-8 !bg-gray-100 dark:!bg-transparent" onClick={(e) => e.stopPropagation()}>
                                <TabsTrigger value="content" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <FileText className="h-3 w-3" />
                                  Content
                                </TabsTrigger>
                                <TabsTrigger value="links" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Link className="h-3 w-3" />
                                  Links
                                </TabsTrigger>
                                <TabsTrigger value="attachments" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Paperclip className="h-3 w-3" />
                                  Attachments
                                </TabsTrigger>
                                <TabsTrigger value="metadata" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Settings className="h-3 w-3" />
                                  Metadata
                                </TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="content" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  {contentText ? (
                                    <p className="text-xs !text-foreground whitespace-pre-wrap">
                                      {contentText}
                                    </p>
                                  ) : (
                                    <p className="text-xs !text-foreground italic">
                                      No content available
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="links" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    Links and references will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="attachments" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    File attachments and resources will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="metadata" className="mt-3 bg-gray-100 dark:bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="font-medium">Type:</span>{' '}
                                      {node.metadata?.node_type || node.node_type || 'uncategorized'}
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                            </Tabs>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Fallback: Group proposals by block type if blocks structure not available
    if (treeData.proposals && Array.isArray(treeData.proposals) && treeData.proposals.length > 0) {
      // Group proposals by block type
      const treeDescription = treeData.description || '';
      const grouped = treeData.proposals.reduce((acc: any, proposal: any) => {
        const rawType = proposal.node_json?.metadata?.node_type || proposal.node_json?.node_type || 'uncategorized';
        const blockType = rawType.toLowerCase();
        if (!acc[blockType]) {
          acc[blockType] = [];
        }
        acc[blockType].push(proposal);
        return acc;
      }, {} as Record<string, any[]>);

      const formatBlockName = (type: string) => {
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
        return nameMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      };

      return (
        <div className="space-y-3">
          {treeDescription && (
            <div className="pb-3 border-b">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{treeDescription}</p>
            </div>
          )}
          {Object.entries(grouped).map(([blockType, proposals], blockIndex) => {
            const blockKey = `nested_proposal_block_${proposalId}_${blockType}`;
            const isBlockExpanded = expandedNestedBlocks.has(blockKey);

            return (
              <div key={blockType} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newExpanded = new Set(expandedNestedBlocks);
                    if (isBlockExpanded) {
                      newExpanded.delete(blockKey);
                    } else {
                      newExpanded.add(blockKey);
                    }
                    setExpandedNestedBlocks(newExpanded);
                  }}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium">
                    {blockIndex + 1}
                  </div>
                  <h4 className="text-sm font-medium flex-1">{formatBlockName(blockType)} Block</h4>
                  <Badge variant="outline" className="text-xs">
                    {proposals.length} node(s)
                  </Badge>
                  <ChevronDown 
                    className={`w-3 h-3 transition-transform ${isBlockExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
                {isBlockExpanded && (
                  <div className="px-2 pb-2 space-y-3">
                    {proposals.map((proposal: any, nodeIndex: number) => {
                      const node = proposal.node_json;
                      const contentText = typeof node.content === 'string' ? node.content : node.content?.text || '';
                      const description = node.short_summary || node.description || '';
                      
                      return (
                        <Card key={proposal.id} className="text-xs w-full" onClick={(e) => e.stopPropagation()}>
                          <CardHeader className="pb-0 min-w-0">
                            <CardTitle className="text-sm">{node.title}</CardTitle>
                          </CardHeader>
                          <CardContent onClick={(e) => e.stopPropagation()}>
                            <Tabs defaultValue="content" className="w-full" onClick={(e) => e.stopPropagation()}>
                              <TabsList className="grid w-full grid-cols-4 h-8 !bg-gray-100 dark:!bg-transparent" onClick={(e) => e.stopPropagation()}>
                                <TabsTrigger value="content" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <FileText className="h-3 w-3" />
                                  Content
                                </TabsTrigger>
                                <TabsTrigger value="links" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Link className="h-3 w-3" />
                                  Links
                                </TabsTrigger>
                                <TabsTrigger value="attachments" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Paperclip className="h-3 w-3" />
                                  Attachments
                                </TabsTrigger>
                                <TabsTrigger value="metadata" className="flex items-center gap-1 text-xs px-2 !text-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Settings className="h-3 w-3" />
                                  Metadata
                                </TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="content" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  {contentText ? (
                                    <p className="text-xs !text-foreground whitespace-pre-wrap">
                                      {contentText}
                                    </p>
                                  ) : (
                                    <p className="text-xs !text-foreground italic">
                                      No content available
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="links" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    Links and references will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="attachments" className="mt-3 !bg-gray-100 dark:!bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <p className="text-xs !text-foreground">
                                    File attachments and resources will be displayed here
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="metadata" className="mt-3 bg-gray-100 dark:bg-transparent p-3 rounded-md">
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="font-medium">Type:</span>{' '}
                                      {node.metadata?.node_type || node.node_type || 'uncategorized'}
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                            </Tabs>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // If no proposals, show empty state
    return <div className="text-xs text-muted-foreground p-2">No nested tree proposals available.</div>;
  }, [expandedNestedBlocks]);

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

      // Fetch sources (user-scoped, no projectId needed)
      const sourcesResponse = await fetch(`/api/import/upload`, { 
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
        console.log(`[IMPORT] Auto-detecting ${stuckFiles.length} stuck files, retrying processing...`);
        
        // Retry processing for stuck files (fire and forget, don't block UI)
        Promise.all(stuckFiles.map(async (source: IngestionSource) => {
          try {
            await fetch(`/api/projects/${projectId}/fix-stuck-files`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ 
                retry: true,
                sourceIds: [source.id] 
              }),
            });
            console.log(`[IMPORT] Retrying processing for: ${source.source_name}`);
          } catch (err) {
            console.error(`[IMPORT] Failed to retry processing for: ${source.source_name}`, err);
          }
        })).then(() => {
          // Refresh data after retrying
          setTimeout(() => fetchData(), 3000);
        });
      }
      
      // Auto-retry files in 'uploaded' status that were recently stuck (within last 15 minutes)
      const recentlyStuckFiles = fetchedSources.filter((source: IngestionSource) => {
        if (source.status !== 'uploaded') return false;
        const updatedAt = new Date(source.updated_at).getTime();
        const age = now - updatedAt;
        // Files that were reset to 'uploaded' within the last 15 minutes
        return age < 15 * 60 * 1000 && age > 0;
      });
      
      if (recentlyStuckFiles.length > 0) {
        console.log(`[IMPORT] Auto-retrying ${recentlyStuckFiles.length} recently reset files...`);
        
        // Retry processing for recently reset files
        Promise.all(recentlyStuckFiles.map(async (source: IngestionSource) => {
          try {
            await fetch(`/api/projects/${projectId}/fix-stuck-files`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ 
                retry: true,
                sourceIds: [source.id] 
              }),
            });
            console.log(`[IMPORT] Auto-retrying: ${source.source_name}`);
          } catch (err) {
            console.error(`[IMPORT] Failed to auto-retry: ${source.source_name}`, err);
          }
        })).then(() => {
          // Refresh data after retrying
          setTimeout(() => fetchData(), 3000);
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
        const fetchedProposals = proposalsData.proposals || [];
        setProposals(fetchedProposals);
        
        // Calculate stats on frontend since API doesn't provide them
        if (fetchedProposals.length > 0) {
          // Group proposals by node type
          const groupedProposals: Record<string, any[]> = {};
          fetchedProposals.forEach((proposal: any) => {
            const rawType = proposal.node_json?.metadata?.node_type || 'uncategorized';
            const blockType = rawType.toLowerCase();
            if (!groupedProposals[blockType]) {
              groupedProposals[blockType] = [];
            }
            groupedProposals[blockType].push(proposal);
          });

          // Calculate total blocks (split large blocks same as rendering logic)
          const MAX_NODES_PER_BLOCK = 15;
          let totalBlocks = 0;
          Object.values(groupedProposals).forEach((nodes: any[]) => {
            totalBlocks += Math.ceil(nodes.length / MAX_NODES_PER_BLOCK);
          });

          setProposalsStats({
            totalNodes: fetchedProposals.length,
            totalBlocks,
            blockBreakdown: []
          });
        } else {
          setProposalsStats(null);
        }
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
          
          case 'progress_update':
            console.log('[SSE] Progress update received:', data);
            console.log('[SSE] Current jobId:', currentJobId, 'Message jobId:', data.jobId);
            // Note: Both proposal generation and tree building progress now handled via polling, not SSE
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
    
    // Check for active job on mount and resume if found
    const checkActiveJob = async () => {
      const storedJobId = getStoredJobId(projectId);
      if (storedJobId) {
        console.log('[IMPORT] Found stored job ID:', storedJobId);
        
        try {
          // Check if job is still active
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const progressRes = await fetch(`/api/projects/${projectId}/progress/${storedJobId}`, {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            });
            
            if (progressRes.ok) {
              const progress = await progressRes.json();
              
              if (progress.stage === 'complete') {
                console.log('[IMPORT] Stored job is complete, clearing localStorage');
                clearStoredJobId(projectId);
                setCurrentJobId(null);
                setGeneratingProposals(false);
                setGenerationProgress(0);
                setGenerationStatus('');
                // Refresh data to show new proposals
                await fetchData();
                setActiveTab('proposals');
              } else if (progress.stage === 'error') {
                console.log('[IMPORT] Stored job failed, clearing localStorage');
                clearStoredJobId(projectId);
                setCurrentJobId(null);
                setGeneratingProposals(false);
                setGenerationProgress(0);
                setGenerationStatus('');
                toast.error(progress.message || 'Generation failed');
              } else {
                console.log('[IMPORT] Resuming job tracking for:', storedJobId);
                setCurrentJobId(storedJobId);
                setGeneratingProposals(true);
                
                // Calculate percentage
                const percentage = progress.total > 0 
                  ? Math.round((progress.current / progress.total) * 100) 
                  : 0;
                
                setGenerationProgress(percentage);
                setGenerationStatus(progress.message || 'Resuming...');
                
                // Resume polling
                console.log('[IMPORT] Resuming polling for progress...');
                const pollInterval = setInterval(async () => {
                  const status = await pollProgress(storedJobId);
                  if (status === 'complete' || status === 'error' || status === 'cancelled') {
                    clearInterval(pollInterval);
                    (window as any).__progressPollInterval = null;
                  }
                }, 1000);
                
                // Store interval reference for cleanup
                (window as any).__progressPollInterval = pollInterval;
              }
            } else {
              console.log('[IMPORT] Could not fetch progress for stored job, clearing localStorage');
              clearStoredJobId(projectId);
            }
          }
        } catch (error) {
          console.error('[IMPORT] Error checking stored job:', error);
          clearStoredJobId(projectId);
        }
      }
    };
    
    checkActiveJob();
    
    // Check for active tree build job on mount and resume if found
    const checkActiveTreeJob = async () => {
      const storedTreeJobId = getStoredTreeJobId(projectId);
      if (storedTreeJobId) {
        console.log('[IMPORT] Found stored tree build job ID:', storedTreeJobId);
        
        try {
          // Check if job is still active
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const progressRes = await fetch(`/api/projects/${projectId}/progress/${storedTreeJobId}`, {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            });
            
            if (progressRes.ok) {
              const progress = await progressRes.json();
              
              if (progress.stage === 'complete') {
                console.log('[IMPORT] Stored tree build job is complete, clearing localStorage');
                clearStoredTreeJobId(projectId);
                setTreeBuildJobId(null);
                setBuildingTree(false);
                setTreeBuildProgress(0);
                setTreeBuildStatus('');
              } else if (progress.stage === 'error') {
                console.log('[IMPORT] Stored tree build job failed, clearing localStorage');
                clearStoredTreeJobId(projectId);
                setTreeBuildJobId(null);
                setBuildingTree(false);
                setTreeBuildProgress(0);
                setTreeBuildStatus('');
                toast.error(progress.message || 'Tree building failed');
              } else {
                console.log('[IMPORT] Resuming tree build job tracking for:', storedTreeJobId);
                setTreeBuildJobId(storedTreeJobId);
                setBuildingTree(true);
                
                // Calculate percentage
                const percentage = progress.total > 0 
                  ? Math.round((progress.current / progress.total) * 100) 
                  : 0;
                
                setTreeBuildProgress(percentage);
                setTreeBuildStatus(progress.message || 'Resuming tree build...');
                
                // Resume polling
                console.log('[IMPORT] Resuming tree build polling...');
                const pollInterval = setInterval(async () => {
                  const status = await pollTreeProgress(storedTreeJobId);
                  if (status === 'complete' || status === 'error') {
                    clearInterval(pollInterval);
                  }
                }, 1000);
                
                (window as any).__treeBuildPollInterval = pollInterval;
              }
            } else {
              console.log('[IMPORT] Could not fetch progress for stored tree build job, clearing localStorage');
              clearStoredTreeJobId(projectId);
            }
          }
        } catch (error) {
          console.error('[IMPORT] Error checking stored tree build job:', error);
          clearStoredTreeJobId(projectId);
        }
      }
    };
    
    checkActiveTreeJob();
    
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
      // Cleanup proposal polling interval
      if ((window as any).__progressPollInterval) {
        clearInterval((window as any).__progressPollInterval);
      }
      // Cleanup tree build polling interval
      if ((window as any).__treeBuildPollInterval) {
        clearInterval((window as any).__treeBuildPollInterval);
      }
    };
  }, [fetchData, connectSSE, projectId]);

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) return;

    // Check file size before attempting upload (client-side validation)
    const maxSize = 25 * 1024 * 1024; // 25MB
    const oversizedFiles = selectedFiles.filter(f => f.size > maxSize);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      // Check if any oversized files are videos
      const hasVideo = oversizedFiles.some(f => f.type.startsWith('video/'));
      const videoNote = hasVideo ? ' Tip: If your video is too large, convert it to an audio file (MP3, WAV, etc.) for a significant decrease in file size.' : '';
      toast.error(`${oversizedFiles.length === 1 ? 'File' : 'Files'} too large: ${fileNames}. Maximum file size is 25MB.${videoNote}`);
      return;
    }

    // Check file limit before attempting upload
    if (sources.length >= 7) {
      toast.error('You have reached the maximum limit of 7 uploaded files. Please delete some files before uploading new ones.');
      return;
    }

    // Check if adding these files would exceed the limit
    const filesToAdd = selectedFiles.length;
    const totalAfterUpload = sources.length + filesToAdd;
    if (totalAfterUpload > 7) {
      const allowed = 7 - sources.length;
      toast.error(`You can only upload ${allowed} more file(s). You selected ${filesToAdd} file(s). Please delete some files or reduce your selection.`);
      return;
    }

    setUploading(true);
    try {
      // Get session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Upload files sequentially to avoid overwhelming the server (files are user-scoped, no projectId needed)
      const uploadPromises = selectedFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);
        // Note: projectId removed - files are user-scoped, shared across all projects

        const response = await fetch('/api/import/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        const result = await response.json();
        
        if (!response.ok) {
          // Show specific error message for file limit
          if (result.error?.includes('maximum limit')) {
            toast.error(result.error);
          } else {
            toast.error(`Failed to upload ${file.name}: ${result.error || 'Unknown error'}`);
          }
          throw new Error(`Failed to upload ${file.name}: ${result.error}`);
        }
        
        return { file: file.name, success: true };
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);
      
      // Show success message using the notification system
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        toast.success(`${successCount} file(s) uploaded successfully! Processing started.`);
      }
      
      // Clear selected files and refresh data
      setSelectedFiles([]);
      fetchData();
      setTimeout(fetchData, 2000);
      
    } catch (error) {
      console.error('Upload error:', error);
      // Error messages are already shown via toast in the upload loop
    } finally {
      setUploading(false);
    }
  };

  const handleGitHubImport = async () => {
    if (!githubUrl) return;

    // Check file limit before attempting import
    if (sources.length >= 7) {
      toast.error('You have reached the maximum limit of 7 uploaded files. Please delete some files before importing new ones.');
      return;
    }

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
          // Note: projectId removed - files are user-scoped, shared across all projects
          // Token removed - only public repos supported for now
          token: undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('GitHub repository imported successfully!');
        setGithubUrl('');
        setGithubToken('');
        fetchData(); // Refresh data
        setTimeout(fetchData, 2000);
      } else {
        // Show specific error message for file limit
        if (result.error?.includes('maximum limit')) {
          toast.error(result.error);
        } else {
          toast.error(result.error || 'Import failed');
        }
      }
    } catch (error) {
      console.error('GitHub import error:', error);
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Handle selection for proposal generation
  const handleSelectSourceForProposals = (sourceId: string, checked: boolean) => {
    const newSelected = new Set(selectedSourcesForProposals);
    if (checked) {
      newSelected.add(sourceId);
    } else {
      newSelected.delete(sourceId);
    }
    setSelectedSourcesForProposals(newSelected);
  };

  const handleSelectAllForProposals = (selectAll: boolean) => {
    const completedSources = sources.filter(s => s.status === 'completed');
    if (selectAll) {
      setSelectedSourcesForProposals(new Set(completedSources.map(s => s.id)));
    } else {
      setSelectedSourcesForProposals(new Set());
    }
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
        toast.success(`Successfully deleted ${result.deletedCount} source(s)`);
        setSelectedSources(new Set());
        await fetchData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to delete sources');
      }
    } catch (error) {
      console.error('Clear sources error:', error);
      toast.error(`Failed to delete sources: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        toast.success(`Successfully cleared all imports (${result.deletedCount} sources)`);
        setSelectedSources(new Set());
        await fetchData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to clear all sources');
      }
    } catch (error) {
      console.error('Clear all sources error:', error);
      toast.error(`Failed to clear all sources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearing(false);
    }
  };

  const handleClearAllUploadedFiles = async () => {
    if (sources.length === 0) {
      toast.error('No files to clear');
      return;
    }

    const confirmed = confirm(
      'Are you sure you want to clear all uploaded files? This will delete all uploaded files but will keep your proposals. This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    setClearing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Get all source IDs
      const sourceIds = sources.map(source => source.id);

      // Delete only the sources (not proposals)
      const response = await fetch(`/api/projects/${projectId}/sources`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sourceIds: sourceIds,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Successfully cleared ${result.deletedCount || sourceIds.length} uploaded file(s)`);
        setSelectedSources(new Set());
        await fetchData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to clear uploaded files');
      }
    } catch (error) {
      console.error('Clear uploaded files error:', error);
      toast.error(`Failed to clear uploaded files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearing(false);
    }
  };

  const handleGenerateProposals = () => {
    // Check if there are existing proposals
    if (proposals.length > 0) {
      // Just show the confirmation modal, don't start generating yet
      setShowRegenerateConfirm(true);
      return;
    }
    
    // If no existing proposals, generate directly
    generateProposalsInternal();
  };

  const generateProposalsInternal = async () => {
    // Get selected source IDs for proposal generation (or use all completed files if none selected)
    const completedSources = sources.filter(s => s.status === 'completed');
    const sourceIdsToUse = selectedSourcesForProposals.size > 0 
      ? Array.from(selectedSourcesForProposals).filter(id => 
          completedSources.some(s => s.id === id)
        )
      : completedSources.map(s => s.id);

    if (sourceIdsToUse.length === 0) {
      toast.error('Please select at least one completed file to generate proposals from, or ensure you have completed files.');
      return;
    }

    setGeneratingProposals(true);
    setGenerationProgress(0);
    setGenerationStatus('Initializing...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Start generation without deleting existing proposals; backend handles safe regeneration
      setGenerationStatus('Starting AI proposal generation...');

      // Generate new proposals with selected source IDs (starts async process)
      const response = await fetch(`/api/projects/${projectId}/generate-proposals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedSourceIds: sourceIdsToUse,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate proposals');
      }

      const result = await response.json();
      const jobId = result.jobId;
      setCurrentJobId(jobId);
      
      // Store jobId in localStorage for cross-tab persistence
      storeJobId(projectId, jobId);
      
      console.log('[GENERATE] Proposals generation started with jobId:', jobId);
      console.log('[GENERATE] Starting polling for progress updates...');

      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const status = await pollProgress(jobId);
        if (status === 'complete' || status === 'error' || status === 'cancelled') {
          clearInterval(pollInterval);
          (window as any).__progressPollInterval = null;
        }
      }, 1000); // Poll every 1 second

      // Store interval reference for cleanup
      (window as any).__progressPollInterval = pollInterval;

    } catch (error: any) {
      console.error('Generate proposals error:', error);
      toast.error(error.message || 'Failed to generate proposals');
      setGeneratingProposals(false);
      setGenerationProgress(0);
      setGenerationStatus('');
      setCurrentJobId(null);
      // Clear stored jobId on error
      clearStoredJobId(projectId);
    } finally {
      setShowRegenerateConfirm(false);
    }
  };

  const handleStopGeneration = async () => {
    if (!currentJobId) {
      console.error('[STOP] No current job ID');
      return;
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      console.log('[STOP] Cancelling job:', currentJobId);

      const response = await fetch(`/api/projects/${projectId}/jobs/${currentJobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel generation');
      }

      console.log('[STOP] Job cancellation requested successfully');
      setGenerationStatus('Stopping generation...');
      
    } catch (error: any) {
      console.error('[STOP] Error cancelling generation:', error);
      toast.error(error.message || 'Failed to stop generation');
    }
  };

  const handleStopTreeBuilding = async () => {
    if (!treeBuildJobId) {
      console.error('[STOP_TREE] No current tree build job ID');
      return;
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      console.log('[STOP_TREE] Cancelling tree build job:', treeBuildJobId);

      const response = await fetch(`/api/projects/${projectId}/jobs/${treeBuildJobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel tree building');
      }

      console.log('[STOP_TREE] Tree building cancelled successfully');
      
      // Clear the stored job ID
      clearStoredTreeJobId(projectId);
      
      // Stop polling
      if ((window as any).__treeBuildPollInterval) {
        clearInterval((window as any).__treeBuildPollInterval);
        (window as any).__treeBuildPollInterval = null;
      }
      
      // Reset state
      setBuildingTree(false);
      setTreeBuildProgress(0);
      setTreeBuildStatus('');
      setTreeBuildJobId(null);
      
      toast.success('Tree building cancelled successfully');
      
    } catch (error: any) {
      console.error('[STOP_TREE] Error cancelling tree building:', error);
      toast.error(error.message || 'Failed to cancel tree building');
    }
  };

  // Poll progress endpoint for updates
  const pollProgress = useCallback(async (jobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(`/api/projects/${projectId}/progress/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        console.error('[POLL] Failed to fetch progress');
        return;
      }

      const progress = await response.json();
      console.log('[POLL] Progress update:', progress);

      // Calculate percentage
      const percentage = progress.total > 0 
        ? Math.round((progress.current / progress.total) * 100) 
        : 0;

      console.log('[POLL] Calculated percentage:', {
        current: progress.current,
        total: progress.total,
        percentage: percentage,
        stage: progress.stage,
        message: progress.message,
      });
      
      setGenerationProgress(percentage);
      setGenerationStatus(progress.message || 'Processing...');

      // Check if cancelled (check message first for immediate response)
      const wasCancelled = progress.message?.toLowerCase().includes('cancelled') || 
                           progress.message?.toLowerCase().includes('stopped') ||
                           progress.message?.toLowerCase().includes('cancel');
      
      if (wasCancelled) {
        console.log('[POLL] Generation cancelled!');
        // Immediately stop polling and clear UI
        clearStoredJobId(projectId);
        setGeneratingProposals(false);
        setGenerationProgress(0);
        setGenerationStatus('');
        setCurrentJobId(null);
        toast.success(progress.message || 'Generation cancelled. Nodes created are preserved.');
        fetchData();
        return 'cancelled';
      }

      // Check if complete
      if (progress.stage === 'complete') {
        console.log('[POLL] Generation complete!');
        // Update UI first
        setGenerationProgress(100);
        setGenerationStatus(progress.message || 'Complete!');
        
        // Small delay to show 100% completion
        setTimeout(() => {
          clearStoredJobId(projectId);
          setGeneratingProposals(false);
          setGenerationProgress(0);
          setGenerationStatus('');
          setCurrentJobId(null);
          // Refresh data to show new proposals
          fetchData();
          setActiveTab('proposals');
          toast.success('Generated proposals successfully!');
        }, 1500);
        
        return 'complete';
      } else if (progress.stage === 'error') {
        console.error('[POLL] Generation failed:', progress.message);
        clearStoredJobId(projectId);
        setGeneratingProposals(false);
        setGenerationProgress(0);
        setGenerationStatus('');
        setCurrentJobId(null);
        toast.error(progress.message || 'Generation failed');
        return 'error';
      }
      
      return 'running';
    } catch (error) {
      console.error('[POLL] Error fetching progress:', error);
      return 'running'; // Continue polling on error
    }
  }, [projectId, supabase, setGenerationProgress, setGenerationStatus, setGeneratingProposals, setCurrentJobId, setActiveTab, fetchData, clearStoredJobId]);

  const pollTreeProgress = useCallback(async (jobId: string) => {
    console.log('[TREE_POLL] ===== Starting poll for jobId:', jobId, '=====');
    
    try {
      console.log('[TREE_POLL] Getting session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[TREE_POLL] Session retrieved:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token
      });
      
      if (!session?.access_token) {
        console.warn('[TREE_POLL] No access token, skipping poll');
        return 'running';
      }

      const progressUrl = `/api/projects/${projectId}/progress/${jobId}`;
      console.log('[TREE_POLL] Fetching progress from:', progressUrl);
      
      const response = await fetch(progressUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      console.log('[TREE_POLL] Response status:', response.status);
      console.log('[TREE_POLL] Response ok:', response.ok);

      if (!response.ok) {
        console.error('[TREE_POLL] Failed to fetch progress, status:', response.status);
        const errorText = await response.text();
        console.error('[TREE_POLL] Error response:', errorText);
        return 'running';
      }

      const progress = await response.json();
      console.log('[TREE_POLL] Progress data received:', {
        stage: progress.stage,
        current: progress.current,
        total: progress.total,
        message: progress.message,
        timestamp: progress.timestamp
      });

      // Calculate percentage
      const percentage = progress.total > 0 
        ? Math.round((progress.current / progress.total) * 100) 
        : 0;
      
      console.log('[TREE_POLL] Calculated percentage:', percentage);
      
      setTreeBuildProgress(percentage);
      setTreeBuildStatus(progress.message || 'Building tree...');
      console.log('[TREE_POLL] UI state updated');

      // Check if complete
      if (progress.stage === 'complete') {
        console.log('[TREE_POLL] ===== TREE BUILDING COMPLETE =====');
        setTreeBuildProgress(100);
        
        setTimeout(() => {
          console.log('[TREE_POLL] Cleaning up after completion...');
          clearStoredTreeJobId(projectId);
          setBuildingTree(false);
          setTreeBuildProgress(0);
          setTreeBuildStatus('');
          setTreeBuildJobId(null);
          fetchData();
          
          // Get tree ID from result
          const treeId = progress.result?.treeId || progress.treeId;
          console.log('[TREE_POLL] Tree ID:', treeId);
          
          if (treeId) {
            console.log('[TREE_POLL] Navigating to tree:', treeId);
            router.push(`/project/${projectId}/trees/${treeId}`);
          } else {
            console.log('[TREE_POLL] No tree ID found, showing success message');
            toast.success('Tree created successfully!');
          }
        }, 1500);
        
        return 'complete';
      } else if (progress.stage === 'error') {
        console.error('[TREE_POLL] ===== TREE BUILDING ERROR =====');
        console.error('[TREE_POLL] Error message:', progress.message);
        
        clearStoredTreeJobId(projectId);
        setBuildingTree(false);
        setTreeBuildProgress(0);
        setTreeBuildStatus('');
        setTreeBuildJobId(null);
        toast.error(progress.message || 'Tree building failed');
        
        return 'error';
      }
      
      console.log('[TREE_POLL] Still running, will poll again...');
      return 'running';
      
    } catch (error: any) {
      console.error('[TREE_POLL] ===== ERROR IN POLL =====');
      console.error('[TREE_POLL] Error type:', error.constructor.name);
      console.error('[TREE_POLL] Error message:', error.message);
      console.error('[TREE_POLL] Error stack:', error.stack);
      return 'running'; // Continue polling on error
    }
  }, [projectId, supabase, router, setTreeBuildProgress, setTreeBuildStatus, setBuildingTree, setTreeBuildJobId, clearStoredTreeJobId, fetchData]);

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this file? This will delete it from all your projects. This action cannot be undone.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/import/upload?sourceId=${sourceId}`, { // Files are user-scoped, no projectId needed
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete source');
      }

      toast.success('File deleted successfully');
      await fetchData();
    } catch (error: any) {
      console.error('Delete source error:', error);
      toast.error(error.message || 'Failed to delete file');
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
        let errorMessage = 'Failed to clear proposals';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      await fetchData();
      toast.success('All proposals cleared successfully');
    } catch (error: any) {
      console.error('Clear proposals error:', error);
      toast.error(error.message || 'Failed to clear proposals');
    }
  };

  const handleBuildTree = async () => {
    console.log('[DEBUG] ===== handleBuildTree called =====');
    console.log('[DEBUG] selectedProposals.size:', selectedProposals.size);
    console.log('[DEBUG] buildingTree state:', buildingTree);
    console.log('[DEBUG] projectId:', projectId);
    console.log('[DEBUG] selectedProposals:', Array.from(selectedProposals));
    
    if (selectedProposals.size === 0) {
      console.log('[DEBUG] No proposals selected, returning early');
      toast.error('Please select at least one proposal to build the tree');
      return;
    }

    console.log('[DEBUG] Setting buildingTree to true');
    setBuildingTree(true);
    console.log('[DEBUG] Setting initial progress state');
    setTreeBuildProgress(0);
    setTreeBuildStatus('Starting tree build...');

    // Timeout removed - polling mechanism handles progress updates

    try {
      console.log('[DEBUG] Getting Supabase session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[DEBUG] Session retrieved:', { 
        hasSession: !!session, 
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length 
      });
      
      if (!session?.access_token) {
        console.log('[DEBUG] No access token found, throwing error');
        throw new Error('Not authenticated');
      }

      console.log(`[DEBUG] Generating jobId...`);
      const jobId = crypto.randomUUID();
      console.log('[DEBUG] Generated jobId:', jobId);
      
      console.log('[DEBUG] Setting treeBuildJobId state...');
      setTreeBuildJobId(jobId);
      console.log('[DEBUG] treeBuildJobId set successfully');
      
      console.log('[DEBUG] Storing jobId in localStorage...');
      storeTreeJobId(projectId, jobId);
      console.log('[DEBUG] jobId stored in localStorage');

      // Get proposal IDs in display order (same order as shown in UI)
      const orderedProposalIds = proposals
        .filter(p => selectedProposals.has(p.id))
        .map(p => p.id);

      const requestBody = {
        action: 'accept',
        proposalIds: orderedProposalIds, // Now in display order
        jobId,
      };
      
      console.log('[DEBUG] Request body prepared:', {
        action: requestBody.action,
        proposalCount: requestBody.proposalIds.length,
        jobId: requestBody.jobId
      });

      const apiUrl = `/api/projects/${projectId}/proposals`;
      console.log('[DEBUG] Making API call to:', apiUrl);
      console.log('[DEBUG] Request headers:', {
        'Authorization': `Bearer ${session.access_token.substring(0, 20)}...`,
        'Content-Type': 'application/json',
      });

      // Start the tree building request
      console.log('[DEBUG] Calling fetch...');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[DEBUG] Fetch completed!');
      console.log('[DEBUG] Response status:', response.status);
      console.log('[DEBUG] Response ok:', response.ok);
      console.log('[DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.log('[DEBUG] Response not ok, parsing error...');
        const errorText = await response.text();
        console.log('[DEBUG] Error response text:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.log('[DEBUG] Parsed error data:', errorData);
        } catch (e) {
          console.error('[DEBUG] Failed to parse error response:', e);
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || 'Failed to build tree');
      }

      console.log('[DEBUG] Parsing success response...');
      const result = await response.json();
      console.log('[DEBUG] Success response:', result);
      
      const returnedJobId = result.jobId;
      console.log('[BUILD TREE] Tree building started with jobId:', returnedJobId);

      // Start polling for progress
      console.log('[DEBUG] Starting polling interval...');
      const pollInterval = setInterval(async () => {
        console.log('[TREE_POLL] Polling for jobId:', returnedJobId);
        const status = await pollTreeProgress(returnedJobId);
        console.log('[TREE_POLL] Poll status:', status);
        if (status === 'complete' || status === 'error') {
          console.log('[TREE_POLL] Stopping polling, status:', status);
          clearInterval(pollInterval);
        }
      }, 1000);

      // Store interval reference for cleanup
      (window as any).__treeBuildPollInterval = pollInterval;
      console.log('[DEBUG] Polling interval started and stored');
      
      // Timeout removed - no cleanup needed
    } catch (error: any) {
      console.log('[DEBUG] ===== ERROR CAUGHT IN CATCH BLOCK =====');
      console.error('[DEBUG] Error type:', error.constructor.name);
      console.error('[DEBUG] Error message:', error.message);
      console.error('[DEBUG] Error stack:', error.stack);
      console.error('[DEBUG] Full error object:', error);
      
      // Timeout removed - no cleanup needed
      
      // Detect specific error types
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('[BUILD_TREE] Network error detected');
        toast.error('Network error: Unable to connect to server');
      } else if (error.name === 'AbortError') {
        console.error('[BUILD_TREE] Request was aborted');
        toast.error('Request was cancelled');
      } else {
        console.error('[BUILD_TREE] Unknown error:', error);
        toast.error(error.message || 'An unknown error occurred');
      }
      
      // Clear stored job ID on error
      console.log('[DEBUG] Clearing stored tree job ID due to error');
      clearStoredTreeJobId(projectId);
      
      // Reset state
      console.log('[DEBUG] Resetting buildingTree state');
      setBuildingTree(false);
      setTreeBuildProgress(0);
      setTreeBuildStatus('');
      setTreeBuildJobId(null);
    } finally {
      console.log('[DEBUG] ===== handleBuildTree finally block =====');
      console.log('[DEBUG] buildingTree state:', buildingTree);
      console.log('[DEBUG] treeBuildJobId:', treeBuildJobId);
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
        </div>
      </div>



        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="cloud">Cloud Storage</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="manage">Manage Files</TabsTrigger>
          <TabsTrigger value="proposals">Review Proposals</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Upload PDFs, Excel files, Word documents, PowerPoint presentations, videos, audio files, or text documents to extract experiment protocols
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
                    accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.mp4,.avi,.mov,.txt,.md,.mp3,.wav,.mpeg,.m4a,.aac"
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
                  Supported formats: PDF, Excel (.xlsx, .xls), Word (.docx, .doc), PowerPoint (.pptx, .ppt), Text (.txt, .md), Video (.mp4, .avi, .mov), Audio (.mp3, .wav, .mpeg, .m4a, .aac)
                  <br />
                  Maximum file size: 25MB per file
                  {selectedFiles.some(f => f.type.startsWith('video/')) && (
                    <>
                      <br />
                      <span className="text-sm text-muted-foreground italic">
                        Tip: If your video is too large, convert it to an audio file for a significant decrease in file size.
                      </span>
                    </>
                  )}
                  <br />
                  You can select multiple files at once for batch upload
                  <br />
                  <span className="font-semibold text-blue-600 dark:text-blue-500">
                    File limit: {sources.length}/7 files uploaded
                  </span>
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
                Import a public GitHub repository to extract the README file for experiment node generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>What gets extracted:</strong> Only the README.md file is currently extracted from the repository. 
                  The README content will be used to generate experiment nodes.
                  <br />
                  <strong>Note:</strong> Only public repositories are supported at this time.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <Label htmlFor="github-url">Repository URL (Public repositories only)</Label>
                <Input
                  id="github-url"
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the URL of a public GitHub repository. Private repositories are not currently supported.
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

        <TabsContent value="cloud" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import from Cloud Storage</CardTitle>
              <CardDescription>
                Connect your cloud storage accounts and import files directly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Connect Accounts</Label>
                <div className="mt-2">
                  <ProviderConnector />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="cloud-provider">Select Provider</Label>
                  <Select
                    value={selectedCloudProvider || ''}
                    onValueChange={(value) => {
                      setSelectedCloudProvider(value as any);
                      setSelectedCloudFiles([]);
                    }}
                  >
                    <SelectTrigger id="cloud-provider" className="mt-2">
                      <SelectValue placeholder="Select a cloud storage provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="googledrive">Google Drive</SelectItem>
                      <SelectItem value="onedrive">OneDrive</SelectItem>
                      <SelectItem value="sharepoint">SharePoint</SelectItem>
                      <SelectItem value="dropbox">Dropbox</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedCloudProvider && (
                  <>
                    <div>
                      <CloudFilePicker
                        provider={selectedCloudProvider}
                        selectedFiles={selectedCloudFiles}
                        onFilesSelected={setSelectedCloudFiles}
                      />
                    </div>

                    {selectedCloudFiles.length > 0 && (
                      <div>
                        <SelectedCloudFilesList
                          files={selectedCloudFiles}
                          onRemove={(file) => {
                            setSelectedCloudFiles(prev => 
                              prev.filter(f => 
                                (selectedCloudProvider === 'dropbox' ? f.path !== file.path : f.id !== file.id)
                              )
                            );
                          }}
                          onClear={() => setSelectedCloudFiles([])}
                        />
                      </div>
                    )}

                    <Button
                      onClick={async () => {
                        if (selectedCloudFiles.length === 0) return;
                        
                        // Check file limit before attempting import
                        if (sources.length >= 7) {
                          toast.error('You have reached the maximum limit of 7 uploaded files. Please delete some files before importing new ones.');
                          return;
                        }

                        // Check if adding these files would exceed the limit
                        const filesToAdd = selectedCloudFiles.length;
                        const totalAfterImport = sources.length + filesToAdd;
                        if (totalAfterImport > 7) {
                          const allowed = 7 - sources.length;
                          toast.error(`You can only import ${allowed} more file(s). You selected ${filesToAdd} file(s). Please delete some files or reduce your selection.`);
                          return;
                        }
                        
                        setCloudImporting(true);
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session?.access_token) {
                            throw new Error('Not authenticated');
                          }

                          let fileIds: string[] = [];
                          let filePaths: string[] = [];
                          
                          if (selectedCloudProvider === 'dropbox') {
                            filePaths = selectedCloudFiles.map(f => f.path || '');
                            console.log('[Import Frontend] Dropbox - Selected files:', selectedCloudFiles);
                            console.log('[Import Frontend] Dropbox - Mapped filePaths:', filePaths);
                            console.log('[Import Frontend] Dropbox - File paths check:', selectedCloudFiles.map(f => ({ name: f.name, path: f.path, hasPath: !!f.path })));
                          } else {
                            fileIds = selectedCloudFiles.map(f => f.id);
                          }

                          const apiProvider = selectedCloudProvider === 'sharepoint' ? 'onedrive' : selectedCloudProvider;
                          const endpoint = `/api/import/${apiProvider}/import`;

                          // Extract siteId from first SharePoint file's metadata (all files from same site)
                          const siteId = selectedCloudProvider === 'sharepoint' && selectedCloudFiles.length > 0
                            ? selectedCloudFiles[0].metadata?.siteId
                            : undefined;

                          const body = selectedCloudProvider === 'dropbox'
                            ? { filePaths } // Files are user-scoped, no projectId needed
                            : { fileIds, ...(siteId ? { siteId } : {}) }; // Files are user-scoped, no projectId needed

                          console.log('[Import Frontend] Sending import request:', {
                            endpoint,
                            body,
                            filePathsCount: filePaths?.length || 0,
                            fileIdsCount: fileIds?.length || 0,
                          });

                          const response = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${session.access_token}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(body),
                          });

                          const result = await response.json();
                          console.log('[Import Frontend] Import response:', result);
                          
                          if (!response.ok) {
                            // Show specific error message for file limit
                            if (result.error?.includes('maximum limit') || result.error?.includes('can only import')) {
                              toast.error(result.error);
                            } else {
                              toast.error(result.error || 'Import failed');
                            }
                            throw new Error(result.error || 'Import failed');
                          }

                          toast.success(`Successfully imported ${result.imported || result.results?.length || 0} file(s)`);
                          
                          setSelectedCloudFiles([]);
                          fetchData();
                          setTimeout(fetchData, 2000);
                        } catch (error) {
                          console.error('Cloud import error:', error);
                          // Error messages are already shown via toast above
                        } finally {
                          setCloudImporting(false);
                        }
                      }}
                      disabled={selectedCloudFiles.length === 0 || cloudImporting}
                      className="w-full"
                    >
                      {cloudImporting ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Importing {selectedCloudFiles.length} file(s)...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import {selectedCloudFiles.length} File(s)
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
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
                    <br />
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-500">
                      {sources.length}/7 files uploaded
                    </span>
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
                  {/* Helper text for checkboxes */}
                  <div className="text-xs text-muted-foreground flex items-center gap-4 pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" disabled className="h-3 w-3" />
                      <span>Select for deletion</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" disabled className="h-3 w-3 text-green-600" />
                      <span>Select for proposal generation (completed files only)</span>
                    </div>
                  </div>
                  {sources.map((source) => {
                    const isCompleted = source.status === 'completed';
                    return (
                      <div
                        key={source.id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          selectedSources.has(source.id) ? 'bg-blue-50 border-blue-200' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedSources.has(source.id)}
                            onChange={(e) => handleSelectSource(source.id, e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            title="Select for deletion"
                          />
                          {isCompleted ? (
                            <input
                              type="checkbox"
                              checked={selectedSourcesForProposals.has(source.id)}
                              onChange={(e) => handleSelectSourceForProposals(source.id, e.target.checked)}
                              className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                              title="Select for proposal generation"
                            />
                          ) : (
                            <div className="w-4" /> /* Spacer for alignment */
                          )}
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
                    );
                  })}
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
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {sources.filter(s => s.status === 'completed').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Processing:</span>
                      <span className="font-medium text-yellow-600 dark:text-yellow-400">
                        {sources.filter(s => s.status === 'processing').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Failed:</span>
                      <span className="font-medium text-red-600 dark:text-red-400">
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
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
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
                          <span className="font-medium text-green-600 dark:text-green-400">
                            {sources.filter(s => s.status === 'completed').length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Processing:</span>
                          <span className="font-medium text-yellow-600 dark:text-yellow-400">
                            {sources.filter(s => s.status === 'processing').length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Failed:</span>
                          <span className="font-medium text-red-600 dark:text-red-400">
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
                <br />
                <span className="text-sm font-medium">
                  {sources.length}/7 files uploaded
                </span>
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
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {sources.length} file(s) uploaded
                      </p>
                      <Button
                        onClick={handleClearAllUploadedFiles}
                        disabled={clearing || sources.length === 0}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-black dark:hover:text-red-600"
                      >
                        {clearing ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Clear All Uploaded Files
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleClearAllProposals}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-black dark:hover:text-red-600"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Clear All Proposals
                      </Button>
                      {/* Modal for confirmation when proposals exist */}
                      {proposals.length > 0 ? (
                        generatingProposals ? (
                          <Button
                            onClick={handleStopGeneration}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-black dark:hover:text-red-600"
                          >
                            <Square className="h-4 w-4 mr-2 fill-current" />
                            Stop Generation
                          </Button>
                        ) : (
                          <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
                            <AlertDialogTrigger asChild>
                              <Button
                                disabled={sources.filter(s => s.status === 'completed').length === 0}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                <Sparkles className="h-4 w-4 mr-2" />
                                Regenerate AI Proposals
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
                        )
                      ) : (
                        generatingProposals ? (
                          <Button
                            onClick={handleStopGeneration}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-black dark:hover:text-red-600"
                          >
                            <Square className="h-4 w-4 mr-2 fill-current" />
                            Stop Generation
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              const completedCount = sources.filter(s => s.status === 'completed').length;
                              if (completedCount === 0) {
                                toast.error('No completed files found. Please upload files first.');
                                return;
                              }
                              generateProposalsInternal();
                            }}
                            disabled={sources.filter(s => s.status === 'completed').length === 0}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate AI Proposals
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                  
                  {/* Progress Bar for AI Generation */}
                  {generatingProposals && generationStatus && (
                    <div className="p-4 border border-blue-600 rounded-lg bg-blue-600 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white">
                          {generationStatus}
                        </span>
                        <span className="text-white">
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
                            {source.source_type === 'text' && <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{source.source_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {source.file_size ? formatFileSize(source.file_size) : 'Unknown size'} • 
                              {source.created_at ? new Date(source.created_at).toLocaleDateString() : 'Unknown date'}
                            </p>
                            {source.status === 'failed' && source.error_message && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {source.error_message}
                              </p>
                            )}
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
                            className="h-8 w-8 p-0 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
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
                      {(() => {
                        // Calculate nested tree count
                        const nestedTreeProposals = proposals.filter(p => 
                          p.node_json?.isNestedTree === true || 
                          p.node_json?.metadata?.isNestedTree === true
                        );
                        
                        // Calculate block count from all proposals
                        const groupedAll = proposals.reduce((acc, proposal) => {
                          const rawType = proposal.node_json?.metadata?.node_type || 'uncategorized';
                          const blockType = rawType.toLowerCase();
                          if (!acc[blockType]) {
                            acc[blockType] = [];
                          }
                          acc[blockType].push(proposal);
                          return acc;
                        }, {} as Record<string, any[]>);
                        
                        const MAX_NODES_PER_BLOCK = 15;
                        let totalBlocks = 0;
                        Object.values(groupedAll).forEach((nodes: any[]) => {
                          totalBlocks += Math.ceil(nodes.length / MAX_NODES_PER_BLOCK);
                        });
                        
                        return (
                          <p className="text-sm text-muted-foreground">
                            {proposals.length} node(s) • {totalBlocks} block(s) • {nestedTreeProposals.length} nested tree(s) • {selectedProposals.size} selected
                          </p>
                        );
                      })()}
                      <p className="text-xs text-muted-foreground mt-1">
                        Click on nodes to select/deselect them for tree building
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleClearAllProposals}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-black dark:hover:text-red-600"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Clear All Proposals
                      </Button>
                      <Button
                        onClick={() => {
                          const allSelected = selectedProposals.size === proposals.length;
                          if (allSelected) {
                            setSelectedProposals(new Set());
                          } else {
                            setSelectedProposals(new Set(proposals.map(p => p.id)));
                          }
                        }}
                        variant="outline"
                        size="sm"
                      >
                        {selectedProposals.size === proposals.length ? 'Clear Selection' : 'Select All'}
                      </Button>
                      {buildingTree ? (
                        <Button
                          onClick={handleStopTreeBuilding}
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <Square className="h-4 w-4 mr-2 fill-current" />
                          Stop Building
                        </Button>
                      ) : (
                        <Button
                          onClick={handleBuildTree}
                          disabled={selectedProposals.size === 0}
                          style={{ backgroundColor: '#1B5E20' }}
                          className="hover:opacity-90"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Build Tree ({selectedProposals.size})
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Tree Building Progress Bar */}
                  {buildingTree && (
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Building Tree
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {treeBuildProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div 
                          className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${treeBuildProgress}%` }}
                        />
                      </div>
                      {treeBuildStatus && (
                        <div className="mt-2 p-2 rounded-md bg-blue-50 dark:bg-slate-800/50 border border-blue-200 dark:border-slate-700">
                          <p className="text-sm text-blue-900 dark:text-blue-100">
                            {treeBuildStatus}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Group proposals by block name (descriptive) or fallback to node type */}
                  {(() => {
                    // Group all proposals by blockName (if available) or fallback to node_type
                    const groupedProposals = proposals.reduce((acc, proposal) => {
                      // Try to get descriptive block name from root level, then metadata, then fallback to node_type
                      const blockName = proposal.node_json?.blockName || 
                                       proposal.node_json?.metadata?.proposedBlockName ||
                                       proposal.node_json?.metadata?.blockName;
                      
                      let groupKey: string;
                      let displayName: string;
                      
                      if (blockName && !blockName.includes('Block')) {
                        // Use descriptive block name (e.g., "Financial Data Preparation & Feature Engineering")
                        groupKey = blockName;
                        displayName = blockName;
                      } else {
                        // Fallback to node_type grouping for old proposals
                        const rawType = proposal.node_json?.metadata?.node_type || 'uncategorized';
                        const blockType = rawType.toLowerCase();
                        groupKey = blockType;
                        
                        // Format block names for display (legacy)
                        const nameMap: Record<string, string> = {
                          'protocol': 'Protocol Block',
                          'analysis': 'Analysis Block',
                          'results': 'Results Block',
                          'data_creation': 'Data Creation Block',
                          'data': 'Data Block',
                          'software': 'Software Block',
                          'instrument': 'Instrument Block',
                          'uncategorized': 'Uncategorized'
                        };
                        displayName = nameMap[blockType] || blockType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Block';
                      }
                      
                      if (!acc[groupKey]) {
                        acc[groupKey] = {
                          displayName,
                          proposals: []
                        };
                      }
                      acc[groupKey].proposals.push(proposal);
                      return acc;
                    }, {} as Record<string, { displayName: string; proposals: any[] }>);

                    // Format block names for display (for legacy node_type grouping)
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
                    const splitLargeBlocks = (grouped: Record<string, { displayName: string; proposals: any[] }>) => {
                      const result: Array<{ key: string; displayName: string; nodes: any[]; part?: number; totalParts?: number }> = [];
                      
                      for (const [groupKey, groupData] of Object.entries(grouped)) {
                        const { displayName, proposals: nodes } = groupData;
                        if (nodes.length <= MAX_NODES_PER_BLOCK) {
                          result.push({ key: groupKey, displayName, nodes });
                        } else {
                          const numParts = Math.ceil(nodes.length / MAX_NODES_PER_BLOCK);
                          for (let i = 0; i < numParts; i++) {
                            const start = i * MAX_NODES_PER_BLOCK;
                            const end = Math.min((i + 1) * MAX_NODES_PER_BLOCK, nodes.length);
                            result.push({
                              key: `${groupKey}_part_${i + 1}`,
                              displayName: `${displayName} - Part ${i + 1}`,
                              nodes: nodes.slice(start, end),
                              part: i + 1,
                              totalParts: numParts
                            });
                          }
                        }
                      }
                      return result;
                    };

                    // Sort blocks: descriptive names first (by position if available), then legacy node_type blocks
                    const blocksToRender = splitLargeBlocks(groupedProposals).sort((a, b) => {
                      // Get position from first proposal in each block
                      const aPos = a.nodes[0]?.node_json?.position ?? a.nodes[0]?.node_json?.metadata?.blockPosition ?? 999;
                      const bPos = b.nodes[0]?.node_json?.position ?? b.nodes[0]?.node_json?.metadata?.blockPosition ?? 999;
                      
                      // If both have positions, sort by position
                      if (aPos !== 999 && bPos !== 999) {
                        return aPos - bPos;
                      }
                      
                      // If only one has position, prioritize it
                      if (aPos !== 999) return -1;
                      if (bPos !== 999) return 1;
                      
                      // Otherwise maintain original order
                      return 0;
                    });

                    return (
                      <div className="space-y-6">
                        {blocksToRender.map((block, blockIndex) => {
                          // Find nested tree proposals in this block
                          const nestedTreeProposalsInBlock = block.nodes.filter(p => 
                            p.node_json?.isNestedTree === true || 
                            p.node_json?.metadata?.isNestedTree === true
                          );
                          const blockKey = block.key;
                          const isBlockExpanded = expandedBlocks.has(blockKey);
                          const selectedInBlock = block.nodes.filter(proposal => selectedProposals.has(proposal.id)).length;
                          
                          return (
                            <div key={blockKey} className="border rounded-lg overflow-hidden">
                              {/* Block Header - Always visible, clickable */}
                              <div 
                                className="flex items-center gap-3 p-4 cursor-pointer transition-colors"
                                onClick={() => {
                                  const newExpanded = new Set(expandedBlocks);
                                  if (isBlockExpanded) {
                                    newExpanded.delete(blockKey);
                                  } else {
                                    newExpanded.add(blockKey);
                                  }
                                  setExpandedBlocks(newExpanded);
                                }}
                              >
                                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
                                  {blockIndex + 1}
                                </div>
                                <h3 className="text-lg font-semibold flex-1 flex items-center gap-2">
                                  {block.displayName || formatBlockName(block.type || 'uncategorized', block.part, block.totalParts)}
                                  {/* Nested Tree Links next to Block Name - Non-clickable indicator */}
                                  {nestedTreeProposalsInBlock.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Link className="w-5 h-5 text-blue-500" />
                                      {nestedTreeProposalsInBlock.length > 1 && (
                                        <Badge variant="secondary" className="text-xs h-5 px-1.5">
                                          {nestedTreeProposalsInBlock.length}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </h3>
                                <div className="flex items-center gap-2">
                                  {selectedInBlock > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                      {selectedInBlock}/{block.nodes.length} selected
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {block.nodes.length} node(s)
                                  </Badge>
                                  <ChevronDown 
                                    className={`w-4 h-4 transition-transform ${isBlockExpanded ? 'rotate-180' : ''}`}
                                  />
                                </div>
                              </div>
                              
                              {/* Block Content - Only visible when expanded */}
                              {isBlockExpanded && (
                                <div className="px-4 pb-4 space-y-3">
                                  {block.nodes.map((proposal, nodeIndex) => {
                                    const node = proposal.node_json;
                                    const isSelected = selectedProposals.has(proposal.id);
                                    
                                    return (
                                      <div 
                                        key={proposal.id} 
                                        className="border border-gray-200 hover:border-gray-300 rounded-lg p-4 cursor-pointer transition-colors"
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
                                            <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium">
                                              {nodeIndex + 1}
                                            </div>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                              <h4 className="font-medium text-sm">{node.title}</h4>
                                              {/* Nested Tree Dropdown Link */}
                                              {(node.isNestedTree || node.metadata?.isNestedTree) && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    fetchNestedTreeData(proposal.id);
                                                  }}
                                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                                  title="View nested tree"
                                                >
                                                  <Link className="w-3 h-3" />
                                                  <span>View Nested Tree</span>
                                                  {loadingNestedTrees.has(proposal.id) ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                  ) : (
                                                    <ChevronDown 
                                                      className={`w-3 h-3 transition-transform ${openNestedTrees.has(proposal.id) ? 'rotate-180' : ''}`}
                                                    />
                                                  )}
                                                </button>
                                              )}
                                            </div>
                                            
                                            {/* Nested Tree Dropdown Content */}
                                            {(node.isNestedTree || node.metadata?.isNestedTree) && openNestedTrees.has(proposal.id) && nestedTreeData[proposal.id] && (
                                              <div className="mb-3 mt-2 border-l-2 border-blue-200 pl-4">
                                                {renderNestedTree(nestedTreeData[proposal.id], proposal.id)}
                                              </div>
                                            )}
                                            
                                            {/* Clickable Tabs */}
                                            <div className="flex gap-1 mb-3">
                                              {node.content?.text && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDetailView(prev => ({
                                                      ...prev,
                                                      [proposal.id]: prev[proposal.id] === "content" ? "" : "content"
                                                    }));
                                                  }}
                                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                                    selectedDetailView[proposal.id] === "content"
                                                      ? 'bg-blue-500 text-white'
                                                      : 'dark:bg-gray-700 dark:text-white'
                                                  }`}
                                                >
                                                  📄 Content
                                                </button>
                                              )}
                                              {node.links && node.links.length > 0 && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDetailView(prev => ({
                                                      ...prev,
                                                      [proposal.id]: prev[proposal.id] === "links" ? "" : "links"
                                                    }));
                                                  }}
                                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                                    selectedDetailView[proposal.id] === "links"
                                                      ? 'bg-blue-500 text-white'
                                                      : 'dark:bg-gray-700 dark:text-white'
                                                  }`}
                                                >
                                                  🔗 Links ({node.links.length})
                                                </button>
                                              )}
                                              {node.attachments && node.attachments.length > 0 && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDetailView(prev => ({
                                                      ...prev,
                                                      [proposal.id]: prev[proposal.id] === "attachments" ? "" : "attachments"
                                                    }));
                                                  }}
                                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                                    selectedDetailView[proposal.id] === "attachments"
                                                      ? 'bg-blue-500 text-white'
                                                      : 'dark:bg-gray-700 dark:text-white'
                                                  }`}
                                                >
                                                  📎 Attachments ({node.attachments.length})
                                                </button>
                                              )}
                                              {node.dependencies && node.dependencies.length > 0 && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDetailView(prev => ({
                                                      ...prev,
                                                      [proposal.id]: prev[proposal.id] === "dependencies" ? "" : "dependencies"
                                                    }));
                                                  }}
                                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                                    selectedDetailView[proposal.id] === "dependencies"
                                                      ? 'bg-blue-500 text-white'
                                                      : 'dark:bg-gray-700 dark:text-white'
                                                  }`}
                                                >
                                                  🔗 Dependencies ({node.dependencies.length})
                                                </button>
                                              )}
                                            </div>
                                            
                                            {/* Detail View Content */}
                                            {selectedDetailView[proposal.id] === "content" && node.content?.text && (
                                              <div className="mt-3 p-3 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                                                <pre className="text-xs whitespace-pre-wrap dark:text-white">
                                                  {node.content.text}
                                                </pre>
                                              </div>
                                            )}

                                            {selectedDetailView[proposal.id] === "links" && node.links && node.links.length > 0 && (
                                              <div className="mt-3 p-3 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                                                <div className="space-y-1">
                                                  {node.links.map((link: any, index: number) => (
                                                    <div key={index} className="text-xs">
                                                      <a 
                                                        href={link.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                                      >
                                                        {link.title || link.url}
                                                      </a>
                                                      {link.type && (
                                                        <span className="dark:text-gray-300 ml-2">({link.type})</span>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {selectedDetailView[proposal.id] === "attachments" && node.attachments && node.attachments.length > 0 && (
                                              <div className="mt-3 p-3 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                                                <div className="space-y-1">
                                                  {node.attachments.map((attachment: any, index: number) => (
                                                    <div key={index} className="text-xs">
                                                      <span className="font-medium dark:text-white">{attachment.filename || attachment.name || `Attachment ${index + 1}`}</span>
                                                      {attachment.range && (
                                                        <span className="dark:text-gray-300 ml-2">({attachment.range})</span>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {selectedDetailView[proposal.id] === "dependencies" && node.dependencies && node.dependencies.length > 0 && (
                                              <div className="mt-3 p-3 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                                                <div className="space-y-2">
                                                  {node.dependencies.map((dep: any, index: number) => {
                                                    const depTypeLabels: Record<string, string> = {
                                                      'requires': 'Requires',
                                                      'uses_output': 'Uses Output',
                                                      'follows': 'Follows',
                                                      'validates': 'Validates'
                                                    };
                                                    const depTypeColors: Record<string, string> = {
                                                      'requires': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
                                                      'uses_output': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                                                      'follows': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                                                      'validates': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                                    };
                                                    const depType = dep.dependency_type || dep.dependencyType || 'requires';
                                                    return (
                                                      <div key={index} className="text-xs border-l-2 border-gray-300 dark:border-gray-600 pl-2">
                                                        <div className="flex items-center gap-2 mb-1">
                                                          <span className="font-medium dark:text-white">
                                                            {dep.referenced_title || dep.referencedNodeTitle || 'Unknown Node'}
                                                          </span>
                                                          <Badge 
                                                            variant="outline" 
                                                            className={`text-xs ${depTypeColors[depType] || 'dark:bg-gray-600 dark:text-white'}`}
                                                          >
                                                            {depTypeLabels[depType] || depType}
                                                          </Badge>
                                                          {dep.confidence !== undefined && (
                                                            <span className="dark:text-gray-300">
                                                              {Math.round((dep.confidence || 0) * 100)}% confidence
                                                            </span>
                                                          )}
                                                        </div>
                                                        {dep.extractedPhrase && (
                                                          <p className="dark:text-gray-300 italic text-xs mt-1">
                                                            "{dep.extractedPhrase}"
                                                          </p>
                                                        )}
                                                        {dep.evidence && !dep.extractedPhrase && (
                                                          <p className="dark:text-gray-300 italic text-xs mt-1">
                                                            "{dep.evidence}"
                                                          </p>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
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
