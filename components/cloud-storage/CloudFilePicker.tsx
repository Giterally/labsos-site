'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase-client';
import { CloudProvider, CloudFile } from '@/lib/cloud-storage/types';
import { toast } from '@/lib/toast';
import { 
  Folder, 
  File, 
  ChevronLeft, 
  Loader2,
  Check,
  X,
} from 'lucide-react';

interface CloudFilePickerProps {
  provider: CloudProvider;
  onFilesSelected: (files: CloudFile[]) => void;
  selectedFiles: CloudFile[];
}

interface SharePointSite {
  id: string;
  name: string;
  webUrl: string;
}

export default function CloudFilePicker({ 
  provider, 
  onFilesSelected, 
  selectedFiles 
}: CloudFilePickerProps) {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderStack, setFolderStack] = useState<string[]>([]);
  
  // SharePoint-specific state
  const [sharePointSites, setSharePointSites] = useState<SharePointSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(false);

  const loadSharePointSites = async () => {
    setLoadingSites(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/import/onedrive/sites', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.message || errorData.error || 'Failed to load SharePoint sites';
        
        // Check for MSA account error
        if (errorData.code === 'MSA_NOT_SUPPORTED' || errorMessage.includes('work or school')) {
          throw new Error('SharePoint is only available for work or school Microsoft accounts. Personal accounts (like @gmail.com) cannot access SharePoint sites.');
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSharePointSites(data.sites || []);
    } catch (error) {
      console.error('Error loading SharePoint sites:', error);
      if (error instanceof Error) {
        toast.error(`Failed to load SharePoint sites: ${error.message}`);
      } else {
        toast.error('Failed to load SharePoint sites');
      }
      setSharePointSites([]);
    } finally {
      setLoadingSites(false);
    }
  };

  const checkConnectionAndLoadFiles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Check connection status
      const connectionResponse = await fetch('/api/import/cloud/connections', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (connectionResponse.ok) {
        const { connections } = await connectionResponse.json();
        const isConnected = connections[provider];
        
        if (!isConnected) {
          setFiles([]);
          toast.error(`Please connect your ${provider === 'googledrive' ? 'Google Drive' : provider === 'onedrive' ? 'OneDrive' : provider === 'sharepoint' ? 'SharePoint' : 'Dropbox'} account first`);
          return;
        }
      }

      // For SharePoint, load sites first if no site is selected
      if (provider === 'sharepoint' && !selectedSiteId) {
        await loadSharePointSites();
        return;
      }

      // If connected (and site selected for SharePoint), load files
      await loadFiles();
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  // Reset state when provider changes
  useEffect(() => {
    if (provider) {
      // Clear files when provider changes to avoid key conflicts
      setFiles([]);
      setCurrentFolder('root');
      setFolderStack([]);
      
      // Reset SharePoint site selection when provider changes
      if (provider !== 'sharepoint') {
        setSelectedSiteId(null);
        setSharePointSites([]);
      }
    }
  }, [provider]);

  // Load files when provider, folder, or site selection changes
  useEffect(() => {
    if (provider) {
      // Check if provider is connected before loading files
      checkConnectionAndLoadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, currentFolder, selectedSiteId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      let response;
      if (provider === 'googledrive') {
        response = await fetch(`/api/import/googledrive/files?folderId=${currentFolder}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } else if (provider === 'onedrive') {
        response = await fetch(`/api/import/onedrive/files?folderId=${currentFolder}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } else if (provider === 'sharepoint') {
        if (!selectedSiteId) {
          throw new Error('Please select a SharePoint site first');
        }
        response = await fetch(`/api/import/onedrive/files?folderId=${currentFolder}&siteId=${encodeURIComponent(selectedSiteId)}&isSharePoint=true`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } else if (provider === 'dropbox') {
        // Dropbox uses empty string for root, not 'root'
        const dropboxPath = currentFolder === 'root' ? '' : currentFolder;
        response = await fetch(`/api/import/dropbox/files?path=${encodeURIComponent(dropboxPath)}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      }

      if (!response?.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        let errorMessage = errorData.message || errorData.error || `HTTP ${response.status}: Failed to load files`;
        
        // Check for Google Drive API not enabled error
        if (errorData.code === 'API_NOT_ENABLED' || errorMessage.includes('API has not been used') || errorMessage.includes('API is not enabled')) {
          errorMessage = 'The Google Drive API has not been enabled for this project. Please enable it in the Google Cloud Console and wait a few minutes for the changes to propagate.';
        }
        
        // Check for authentication errors
        if (errorData.code === 'AUTH_ERROR' || errorMessage.includes('connection has expired')) {
          errorMessage = 'Your Google Drive connection has expired. Please disconnect and reconnect your Google Drive account.';
        }
        
        // Check for MSA account error
        if (errorData.code === 'MSA_NOT_SUPPORTED' || errorMessage.includes('work or school') || errorMessage.includes('personal Microsoft account')) {
          errorMessage = 'This feature requires a work or school Microsoft account. Personal Microsoft accounts have limited access.';
        }
        
        console.error('Failed to load files:', errorMessage, errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      // Show error to user
      if (error instanceof Error) {
        toast.error(`Failed to load files: ${error.message}`);
      } else {
        toast.error('Failed to load files');
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (file: CloudFile) => {
    const isSelected = selectedFiles.some(f => 
      (provider === 'dropbox' ? f.path === file.path : f.id === file.id)
    );

    if (isSelected) {
      onFilesSelected(selectedFiles.filter(f => 
        (provider === 'dropbox' ? f.path !== file.path : f.id !== file.id)
      ));
    } else {
      onFilesSelected([...selectedFiles, file]);
    }
  };

  const handleFolderClick = (folderId: string) => {
    setFolderStack([...folderStack, currentFolder]);
    setCurrentFolder(folderId);
  };

  const handleBack = () => {
    if (folderStack.length > 0) {
      const newStack = [...folderStack];
      const previousFolder = newStack.pop() || 'root';
      setCurrentFolder(previousFolder);
      setFolderStack(newStack);
    }
  };

  const isFileSelected = (file: CloudFile) => {
    return selectedFiles.some(f => 
      (provider === 'dropbox' ? f.path === file.path : f.id === file.id)
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Select Files from {provider === 'googledrive' ? 'Google Drive' : provider === 'onedrive' ? 'OneDrive' : provider === 'sharepoint' ? 'SharePoint' : 'Dropbox'}</CardTitle>
          {folderStack.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
        </div>
        <CardDescription>
          {selectedFiles.length} file(s) selected
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || loadingSites ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : provider === 'sharepoint' && !selectedSiteId ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Please select a SharePoint site to browse files
            </div>
            {sharePointSites.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No SharePoint sites found
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sharePointSites.map((site) => (
                  <div
                    key={site.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                      selectedSiteId === site.id ? 'bg-muted/50 border-muted' : ''
                    }`}
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      setCurrentFolder('root');
                      setFolderStack([]);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{site.name}</div>
                        <div className="text-sm text-muted-foreground truncate">{site.webUrl}</div>
                      </div>
                    </div>
                    {selectedSiteId === site.id && (
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No files found in this folder
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.map((file, index) => {
              // Generate a unique key that combines provider and file identifier
              const fileKey = provider === 'dropbox' 
                ? (file.path || `dropbox-${index}`)
                : (file.id || `${provider}-${index}`);
              const uniqueKey = `${provider}-${fileKey}`;
              
              return (
              <div
                key={uniqueKey}
                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                  isFileSelected(file) ? 'bg-muted/50 border-muted' : ''
                }`}
                onClick={() => {
                  if (file.isFolder) {
                    // Navigate into folder
                    const folderId = provider === 'dropbox' ? file.path! : file.id;
                    handleFolderClick(folderId);
                  } else {
                    // Select file
                    handleFileSelect(file);
                  }
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {file.isFolder ? (
                    <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  ) : (
                    <File className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    {!file.isFolder && (
                      <div className="text-sm text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                </div>
                {isFileSelected(file) && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

