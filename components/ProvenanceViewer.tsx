import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { 
  ExternalLink, 
  FileText, 
  Video, 
  Github, 
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';

interface ProvenanceSource {
  chunk_id: string;
  source_type: string;
  snippet: string;
  offset?: number;
  page?: number;
  timestamp?: string;
}

interface ProvenanceViewerProps {
  sources: ProvenanceSource[];
  onSourceClick?: (source: ProvenanceSource) => void;
  maxSources?: number;
}

export function ProvenanceViewer({ 
  sources, 
  onSourceClick, 
  maxSources = 5 
}: ProvenanceViewerProps) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const displaySources = showAll ? sources : sources.slice(0, maxSources);
  const hasMore = sources.length > maxSources;

  const toggleSource = (chunkId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(chunkId)) {
      newExpanded.delete(chunkId);
    } else {
      newExpanded.add(chunkId);
    }
    setExpandedSources(newExpanded);
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'github':
        return <Github className="h-4 w-4" />;
      case 'excel':
        return <FileSpreadsheet className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getSourceBadgeColor = (sourceType: string) => {
    switch (sourceType) {
      case 'pdf':
        return 'bg-red-100 text-red-800';
      case 'video':
        return 'bg-blue-100 text-blue-800';
      case 'github':
        return 'bg-gray-100 text-gray-800';
      case 'excel':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const highlightQuery = (text: string, query?: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No source information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Source Information</CardTitle>
        <CardDescription>
          {sources.length} source{sources.length !== 1 ? 's' : ''} used to generate this node
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {displaySources.map((source, index) => {
              const isExpanded = expandedSources.has(source.chunk_id);
              
              return (
                <div key={source.chunk_id} className="border rounded-lg">
                  <div 
                    className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleSource(source.chunk_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        {getSourceIcon(source.source_type)}
                        <div>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getSourceBadgeColor(source.source_type)}`}
                            >
                              {source.source_type.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {source.chunk_id.substring(0, 8)}...
                            </span>
                          </div>
                          {source.page && (
                            <span className="text-xs text-muted-foreground">
                              Page {source.page}
                            </span>
                          )}
                          {source.timestamp && (
                            <span className="text-xs text-muted-foreground">
                              {source.timestamp}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {onSourceClick && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSourceClick(source);
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <>
                      <Separator />
                      <div className="p-3 bg-gray-50">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {highlightQuery(source.snippet)}
                        </p>
                        {source.offset && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Character offset: {source.offset}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        
        {hasMore && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Show Less' : `Show All ${sources.length} Sources`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
