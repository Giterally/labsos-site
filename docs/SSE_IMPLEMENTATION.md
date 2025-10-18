# Server-Sent Events (SSE) Implementation Guide

## Overview

This document describes the Server-Sent Events implementation for real-time progress updates in the LabsOS application. SSE provides efficient, one-way communication from server to client for progress tracking and other real-time updates.

## Architecture

### SSE Endpoint
**URL**: `/api/projects/[projectId]/status`  
**Method**: GET  
**Authentication**: Required (Bearer token)

### Connection Flow
```
Client → SSE Request → Server → Postgres Listeners → Real-time Updates → Client
```

## Implementation Details

### Server-Side (`app/api/projects/[projectId]/status/route.ts`)

```typescript
export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  // Authentication check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
        type: 'connected', 
        message: 'Connected to status updates' 
      })}\n\n`));

      // Set up Supabase real-time subscription
      const channel = supabaseServer
        .channel(`project-${projectId}-status`)
        .on('postgres_changes', { /* listeners */ })
        .subscribe();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Postgres Change Listeners

#### 1. Ingestion Sources Updates
```typescript
.on(
  'postgres_changes',
  {
    event: 'UPDATE',
    schema: 'public',
    table: 'ingestion_sources',
    filter: `project_id=eq.${projectId}`,
  },
  (payload) => {
    const data = {
      type: 'status_update',
      sourceId: payload.new.id,
      status: payload.new.status,
      sourceName: payload.new.source_name,
      updatedAt: payload.new.updated_at,
    };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
)
```

#### 2. Progress Updates
```typescript
.on(
  'postgres_changes',
  {
    event: 'UPDATE',
    schema: 'public',
    table: 'jobs',
    filter: `project_id=eq.${projectId}`,
  },
  (payload) => {
    // Only broadcast if progress fields were updated
    if (payload.new.progress_updated_at !== payload.old.progress_updated_at) {
      const data = {
        type: 'progress_update',
        jobId: payload.new.id,
        progress: {
          stage: payload.new.progress_stage,
          current: payload.new.progress_current,
          total: payload.new.progress_total,
          message: payload.new.progress_message,
          timestamp: new Date(payload.new.progress_updated_at).getTime(),
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    }
  }
)
```

#### 3. Proposal Updates
```typescript
.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'public',
    table: 'proposed_nodes',
    filter: `project_id=eq.${projectId}`,
  },
  (payload) => {
    const data = {
      type: 'new_proposal',
      proposalId: payload.new.id,
      title: payload.new.title,
      confidence: payload.new.confidence,
      createdAt: payload.new.created_at,
    };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
)
```

### Client-Side Implementation

#### Connection Setup
```typescript
const connectSSE = useCallback(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const eventSource = new EventSource(
    `/api/projects/${projectId}/status?token=${session.access_token}`
  );

  eventSource.onopen = () => {
    console.log('SSE connection opened');
    setSseConnected(true);
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSSEMessage(data);
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    setSseConnected(false);
    
    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      if (eventSource.readyState === EventSource.CLOSED) {
        connectSSE();
      }
    }, 5000);
  };

  return eventSource;
}, [projectId]);
```

#### Message Handling
```typescript
const handleSSEMessage = (data: any) => {
  switch (data.type) {
    case 'connected':
      console.log('SSE connected:', data.message);
      break;
      
    case 'status_update':
      // Update source status in UI
      setSources(prev => prev.map(source => 
        source.id === data.sourceId 
          ? { ...source, status: data.status, updated_at: data.updatedAt }
          : source
      ));
      break;
      
    case 'progress_update':
      if (data.jobId === currentJobId) {
        const percentage = data.progress.total > 0 
          ? Math.round((data.progress.current / data.progress.total) * 100) 
          : 0;
        
        setGenerationProgress(percentage);
        setGenerationStatus(data.progress.message || 'Processing...');
        
        if (data.progress.stage === 'complete') {
          // Handle completion
          clearStoredJobId(projectId);
          setGeneratingProposals(false);
          // ... cleanup and success handling
        }
      }
      break;
      
    case 'new_proposal':
    case 'proposal_update':
      // Refresh proposals when they change
      fetchData();
      break;
      
    case 'proposal_deleted':
      // Remove from selected if it was selected
      setSelectedProposals(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.proposalId);
        return newSet;
      });
      break;
  }
};
```

## Event Types

### Connection Events
```typescript
{
  type: 'connected',
  message: string
}
```

### Status Updates
```typescript
{
  type: 'status_update',
  sourceId: string,
  status: string,
  sourceName: string,
  updatedAt: string
}
```

### Progress Updates
```typescript
{
  type: 'progress_update',
  jobId: string,
  progress: {
    stage: string,
    current: number,
    total: number,
    message: string,
    timestamp: number
  }
}
```

### Proposal Events
```typescript
// New proposal
{
  type: 'new_proposal',
  proposalId: string,
  title: string,
  confidence: number,
  createdAt: string
}

// Proposal update
{
  type: 'proposal_update',
  proposalId: string,
  // ... updated fields
}

// Proposal deleted
{
  type: 'proposal_deleted',
  proposalId: string
}
```

## Error Handling

### Connection Errors
```typescript
eventSource.onerror = (error) => {
  console.error('SSE connection error:', error);
  setSseConnected(false);
  
  // Implement exponential backoff for reconnection
  const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  
  setTimeout(() => {
    if (eventSource.readyState === EventSource.CLOSED) {
      connectSSE();
    }
  }, reconnectDelay);
};
```

### Message Parsing Errors
```typescript
eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    handleSSEMessage(data);
  } catch (error) {
    console.error('Error parsing SSE message:', error);
    // Continue processing other messages
  }
};
```

### Authentication Errors
```typescript
// Handle 401 responses
if (eventSource.readyState === EventSource.CLOSED) {
  // Check if it's an auth error
  const response = await fetch(`/api/projects/${projectId}/status`);
  if (response.status === 401) {
    // Redirect to login or refresh token
    window.location.href = '/login';
  }
}
```

## Performance Optimization

### Connection Management
- Single connection per project
- Automatic cleanup on component unmount
- Connection pooling for multiple projects

### Message Filtering
- Only broadcast relevant changes
- Filter by project ID at database level
- Efficient payload structure

### Reconnection Strategy
- Exponential backoff for failed connections
- Maximum retry attempts
- Graceful degradation to polling if needed

## Security Considerations

### Authentication
- All SSE connections require valid session
- Token-based authentication
- Project-level access control

### Data Validation
- Validate all incoming messages
- Sanitize data before broadcasting
- Rate limiting on connections

### CORS Configuration
```typescript
// SSE headers
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL,
  'Access-Control-Allow-Credentials': 'true',
}
```

## Monitoring and Debugging

### Connection Status
```typescript
// Monitor connection state
const [sseConnected, setSseConnected] = useState(false);

// Display connection indicator
{sseConnected ? (
  <div className="text-green-600">🟢 Connected</div>
) : (
  <div className="text-red-600">🔴 Disconnected</div>
)}
```

### Debug Logging
```typescript
// Enable debug mode
const DEBUG_SSE = process.env.NODE_ENV === 'development';

if (DEBUG_SSE) {
  console.log('SSE message received:', data);
}
```

### Health Checks
```typescript
// Periodic health check
setInterval(() => {
  if (eventSource.readyState === EventSource.CLOSED) {
    console.warn('SSE connection lost, attempting reconnect...');
    connectSSE();
  }
}, 30000); // Check every 30 seconds
```

## Testing

### Unit Tests
```typescript
// Mock EventSource for testing
global.EventSource = jest.fn(() => ({
  onopen: null,
  onmessage: null,
  onerror: null,
  readyState: EventSource.OPEN,
  close: jest.fn(),
}));
```

### Integration Tests
```typescript
// Test SSE connection
it('should establish SSE connection', async () => {
  const eventSource = new EventSource('/api/projects/test/status');
  
  await new Promise(resolve => {
    eventSource.onopen = resolve;
  });
  
  expect(eventSource.readyState).toBe(EventSource.OPEN);
  eventSource.close();
});
```

## Best Practices

### Development
- Use connection status indicators
- Implement proper error handling
- Test with network interruptions
- Monitor connection health

### Production
- Set up connection monitoring
- Implement rate limiting
- Use CDN for SSE endpoints
- Monitor message throughput

## Troubleshooting

### Common Issues

**Connection not establishing**:
- Check authentication token
- Verify CORS configuration
- Check network connectivity
- Review server logs

**Messages not received**:
- Verify Postgres listeners are active
- Check database permissions
- Monitor server resources
- Review message format

**Frequent disconnections**:
- Check network stability
- Review server timeout settings
- Monitor server resources
- Implement proper reconnection logic

### Debug Commands
```javascript
// Check connection state
console.log('SSE readyState:', eventSource.readyState);

// Monitor messages
eventSource.onmessage = (event) => {
  console.log('SSE message:', event.data);
};

// Check Supabase connection
supabase.getChannels().forEach(channel => {
  console.log('Channel:', channel.topic, 'State:', channel.state);
});
```
