# Progress Tracking System Architecture

## Overview

The progress tracking system provides real-time, cross-tab, and cross-session progress updates for long-running operations like AI proposal generation and tree building. It combines database persistence with in-memory caching and Server-Sent Events (SSE) for optimal performance and reliability.

## Architecture Components

### 1. Database Layer

**Tables**:
- `jobs` - Stores job metadata and progress information
  - `progress_stage` - Current stage (initializing, clustering, synthesizing, etc.)
  - `progress_current` - Current step number
  - `progress_total` - Total number of steps
  - `progress_message` - Human-readable status message
  - `progress_updated_at` - Timestamp for SSE notifications

**Functions**:
- `update_job_progress(job_id, stage, current_step, total_steps, message)` - Atomic progress updates
- `complete_job_progress(job_id, message)` - Mark job as complete
- `error_job_progress(job_id, error_message)` - Mark job as failed

### 2. Progress Tracker Service

**File**: `lib/progress-tracker.ts`

**Features**:
- In-memory cache for fast access
- Database persistence for reliability
- Fallback mechanism (cache → database)
- Subscriber pattern for real-time notifications
- Auto-cleanup of completed/error jobs

**Key Methods**:
```typescript
// Persistence-enabled methods
updateWithPersistence(jobId, progress): Promise<void>
getWithFallback(jobId): Promise<ProgressUpdate | null>
completeWithPersistence(jobId, message): Promise<void>
errorWithPersistence(jobId, errorMessage): Promise<void>

// Legacy methods (in-memory only)
update(jobId, progress): void
get(jobId): ProgressUpdate | null
complete(jobId, message): void
error(jobId, errorMessage): void
```

### 3. Server-Sent Events (SSE)

**Endpoint**: `/api/projects/[projectId]/status`

**Features**:
- Real-time progress updates via SSE
- Postgres change listeners for `jobs` table
- Automatic reconnection on disconnect
- Efficient broadcasting to multiple clients

**Event Types**:
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

### 4. Client-Side State Management

**File**: `app/dashboard/projects/[projectId]/import/page.tsx`

**Features**:
- localStorage for cross-tab persistence
- SSE connection management
- Progress state synchronization
- Resume functionality on page load

**localStorage Keys**:
- `active_proposal_job_${projectId}` - Current proposal generation job
- `active_tree_build_job_${projectId}` - Current tree building job

## Data Flow

### 1. Job Creation
```
Client → API → Database (create job) → Return jobId → Client (store in localStorage)
```

### 2. Progress Updates
```
Pipeline → ProgressTracker.updateWithPersistence() → Database (atomic update) → SSE Broadcast → Client (real-time update)
```

### 3. Cross-Tab Synchronization
```
Tab A: Progress update → Database → SSE → Tab B: Receives update
```

### 4. Page Refresh Recovery
```
Page Load → Check localStorage → Query progress API → Resume tracking
```

## Progress Stages

### Proposal Generation (5 stages)
1. **Initializing** (0-20%) - Setup and planning
2. **Clustering** (20-40%) - Grouping related chunks
3. **Synthesizing** (40-80%) - Creating nodes from clusters
4. **Deduplicating** (80-95%) - Removing duplicates
5. **Complete** (100%) - Finished

### Tree Building (7 stages)
1. **Initializing** (0-14%) - Setup
2. **Fetching** (14-28%) - Get proposals
3. **Creating Tree** (28-42%) - Create experiment tree
4. **Analyzing** (42-56%) - Analyze dependencies
5. **Creating Blocks** (56-70%) - Create workflow blocks
6. **Creating Nodes** (70-84%) - Create tree nodes
7. **Creating Content** (84-100%) - Create node content

## Error Handling

### Database Failures
- Progress updates continue with in-memory cache
- Graceful degradation ensures operation continues
- Error logging for debugging

### SSE Connection Issues
- Automatic reconnection attempts
- Fallback to polling if needed
- Connection status indicators

### Job Recovery
- localStorage cleanup on errors
- Automatic job state validation
- User-friendly error messages

## Performance Considerations

### Database Optimization
- Indexed queries on `progress_updated_at`
- Efficient atomic updates via functions
- Minimal data transfer

### Memory Management
- Auto-cleanup of completed jobs (30s for complete, 60s for errors)
- In-memory cache with database fallback
- Efficient subscriber pattern

### Network Efficiency
- SSE reduces polling overhead
- Compressed progress updates
- Connection pooling

## Security

### Authentication
- All API endpoints require valid session
- Job access restricted by project membership
- Secure job ID generation

### Data Validation
- Progress values validated (0 ≤ current ≤ total)
- Stage values constrained to known stages
- SQL injection prevention via parameterized queries

## Monitoring and Debugging

### Logging
- Progress updates logged with job ID
- Error conditions logged with context
- Performance metrics tracked

### Debug Tools
```javascript
// Check current progress
console.log(progressTracker.get(jobId));

// Check localStorage
localStorage.getItem('active_proposal_job_projectId');

// Monitor SSE connection
eventSource.readyState; // 0=connecting, 1=open, 2=closed
```

### Health Checks
- Database connectivity
- SSE endpoint availability
- Job cleanup processes

## Migration Guide

### From Old System
1. Database migrations add progress fields
2. Progress tracker updated with persistence
3. SSE endpoint enhanced for progress
4. Client updated to use new system
5. Old polling code removed

### Backwards Compatibility
- Legacy methods still available
- Gradual migration possible
- Fallback mechanisms in place

## Best Practices

### Development
- Always use `updateWithPersistence()` for new code
- Handle database errors gracefully
- Test cross-tab scenarios
- Monitor memory usage

### Production
- Monitor database performance
- Set up job cleanup schedules
- Track SSE connection health
- Alert on error rates

## Troubleshooting

### Common Issues

**Progress stuck at 0%**:
- Check if job was created in database
- Verify SSE connection is established
- Check browser console for errors

**Progress not shared across tabs**:
- Verify localStorage is working
- Check if jobId is being stored
- Ensure SSE is broadcasting

**Progress not resuming after refresh**:
- Check localStorage for stored jobId
- Verify job still exists in database
- Check progress API endpoint

### Debug Commands
```sql
-- Check job status
SELECT * FROM jobs WHERE id = 'job-id';

-- Check recent progress updates
SELECT * FROM jobs 
WHERE progress_updated_at > NOW() - INTERVAL '1 hour'
ORDER BY progress_updated_at DESC;
```

## Future Enhancements

### Planned Features
- Progress estimation based on historical data
- Batch progress updates for efficiency
- Progress analytics and reporting
- Custom progress stages per job type

### Scalability Improvements
- Redis caching layer
- Horizontal SSE scaling
- Database sharding support
- CDN for static progress assets
