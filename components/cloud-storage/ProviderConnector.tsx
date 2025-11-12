'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase-client';
import { CloudProvider } from '@/lib/cloud-storage/types';
import { toast } from '@/lib/toast';
import { 
  Cloud, 
  CheckCircle, 
  XCircle, 
  Loader2,
  LogOut,
} from 'lucide-react';

interface ProviderConnectorProps {
  onConnectionChange?: (provider: CloudProvider, connected: boolean) => void;
}

export default function ProviderConnector({ onConnectionChange }: ProviderConnectorProps) {
  const [connections, setConnections] = useState<Record<CloudProvider, boolean>>({
    googledrive: false,
    onedrive: false,
    dropbox: false,
    sharepoint: false,
  });
  const [loading, setLoading] = useState<Record<CloudProvider, boolean>>({
    googledrive: false,
    onedrive: false,
    dropbox: false,
    sharepoint: false,
  });

  const providers: Array<{
    id: CloudProvider;
    name: string;
    description: string;
  }> = [
    {
      id: 'googledrive',
      name: 'Google Drive',
      description: 'Import files from Google Drive and Google Docs',
    },
    {
      id: 'onedrive',
      name: 'OneDrive',
      description: 'Import files from OneDrive',
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      description: 'Import files from SharePoint sites',
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      description: 'Import files from Dropbox',
    },
  ];

  useEffect(() => {
    checkConnections();
  }, []);

  const checkConnections = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/import/cloud/connections', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || {});
      }
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  const handleConnect = async (provider: CloudProvider) => {
    setLoading(prev => ({ ...prev, [provider]: true }));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/import/${provider === 'sharepoint' ? 'onedrive' : provider}/auth`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: Failed to initiate OAuth`);
      }

      const { authUrl } = await response.json();
      
      // Open OAuth window
      window.location.href = authUrl;
    } catch (error) {
      console.error(`Error connecting ${provider}:`, error);
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide helpful guidance for configuration errors
      if (errorMessage.includes('not configured') || errorMessage.includes('Invalid Google OAuth')) {
        const providerName = provider === 'googledrive' ? 'Google Drive' : 
                            provider === 'onedrive' ? 'OneDrive' : 
                            provider === 'dropbox' ? 'Dropbox' : provider;
        if (errorMessage.includes('placeholder')) {
          errorMessage = `${providerName} OAuth client ID appears to be a placeholder. Please set a valid client ID from ${provider === 'googledrive' ? 'Google Cloud Console' : provider === 'onedrive' || provider === 'sharepoint' ? 'Azure Portal' : 'Dropbox App Console'}.`;
        } else {
          errorMessage = `${providerName} OAuth is not configured. Please set the required environment variables in your .env file. See CLOUD_STORAGE_SETUP.md for instructions.`;
        }
      }
      
      toast.error(`Failed to connect ${provider}: ${errorMessage}`);
      setLoading(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleDisconnect = async (provider: CloudProvider) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) {
      return;
    }

    setLoading(prev => ({ ...prev, [provider]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const apiProvider = provider === 'sharepoint' ? 'onedrive' : provider;
      const response = await fetch(`/api/import/${apiProvider}/auth`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      setConnections(prev => ({ ...prev, [provider]: false }));
      onConnectionChange?.(provider, false);
      toast.success(`${provider === 'googledrive' ? 'Google Drive' : provider === 'onedrive' ? 'OneDrive' : provider === 'dropbox' ? 'Dropbox' : 'SharePoint'} disconnected successfully`);
    } catch (error) {
      console.error(`Error disconnecting ${provider}:`, error);
      toast.error(`Failed to disconnect ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(prev => ({ ...prev, [provider]: false }));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {providers.map((provider) => {
        const isConnected = connections[provider.id];
        const isLoading = loading[provider.id];

        return (
          <Card key={provider.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{provider.name}</CardTitle>
                {isConnected ? (
                  <Badge variant="default" className="bg-green-500">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
              </div>
              <CardDescription>{provider.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <Button
                  variant="outline"
                  onClick={() => handleDisconnect(provider.id)}
                  disabled={isLoading}
                  className="w-full hover:text-gray-500 dark:hover:text-foreground"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4 mr-2" />
                      Disconnect
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => handleConnect(provider.id)}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Cloud className="h-4 w-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

