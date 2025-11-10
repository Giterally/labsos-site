'use client';

import { CloudFile } from '@/lib/cloud-storage/types';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SelectedCloudFilesListProps {
  files: CloudFile[];
  onRemove: (file: CloudFile) => void;
  onClear: () => void;
}

export default function SelectedCloudFilesList({ 
  files, 
  onRemove, 
  onClear 
}: SelectedCloudFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'googledrive': return 'Google Drive';
      case 'onedrive': return 'OneDrive';
      case 'sharepoint': return 'SharePoint';
      case 'dropbox': return 'Dropbox';
      default: return provider;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Selected Files ({files.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear All
        </Button>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {files.map((file, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-sm text-muted-foreground">
                {formatFileSize(file.size)} • {getProviderName(file.provider)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(file)}
              className="ml-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

