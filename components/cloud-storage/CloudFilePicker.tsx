'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase-client';
import { CloudProvider, CloudFile } from '@/lib/cloud-storage/types';
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

export default function CloudFilePicker({ 
  provider, 
  onFilesSelected, 
  selectedFiles 
}: CloudFilePickerProps) {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderStack, setFolderStack] = useState<string[]>([]);

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
          alert(`Please connect your ${provider === 'googledrive' ? 'Google Drive' : provider === 'onedrive' ? 'OneDrive' : provider === 'sharepoint' ? 'SharePoint' : 'Dropbox'} account first`);
          return;
        }
      }

      // If connected, load files
      await loadFiles();
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  useEffect(() => {
    if (provider) {
      // Check if provider is connected before loading files
      checkConnectionAndLoadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, currentFolder]);

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
      } else if (provider === 'onedrive' || provider === 'sharepoint') {
        response = await fetch(`/api/import/onedrive/files?folderId=${currentFolder}${provider === 'sharepoint' ? '&siteId=' : ''}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } else if (provider === 'dropbox') {
        response = await fetch(`/api/import/dropbox/files?path=${encodeURIComponent(currentFolder)}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      }

      if (!response?.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: Failed to load files`;
        console.error('Failed to load files:', errorMessage, errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      // Show error to user
      if (error instanceof Error) {
        alert(`Failed to load files: ${error.message}`);
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
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No files found in this folder
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.map((file) => (
              <div
                key={provider === 'dropbox' ? file.path : file.id}
                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-accent ${
                  isFileSelected(file) ? 'bg-primary/10 border-primary' : ''
                }`}
                onClick={() => handleFileSelect(file)}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

