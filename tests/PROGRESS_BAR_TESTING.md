# Progress Bar Testing Guide

## Overview
This document provides comprehensive testing instructions for the new real-time progress bar system that works across browser tabs and sessions.

## Test Environment Setup

1. **Start the development server**: `npm run dev`
2. **Open browser**: Navigate to `http://localhost:3000`
3. **Login**: Use your test account credentials
4. **Navigate to import page**: Go to a project's import page (e.g., `/dashboard/projects/rna-seq-pipeline/import`)

## Test Scenarios

### 1. Single Tab Generation

**Objective**: Verify progress bar works correctly in a single browser tab.

**Steps**:
1. Upload some test files (PDF, text, etc.) to the project
2. Wait for files to process (status should show "completed")
3. Go to "Manage Files" tab
4. Click "Generate AI Proposals"
5. Observe the progress bar

**Expected Results**:
- Progress bar appears immediately
- Progress moves smoothly from 0% → 100%
- Status messages update in real-time:
  - "Initializing proposal generation..."
  - "Analyzing document structure with Planning Agent..."
  - "Clustering X chunks..."
  - "Synthesizing nodes from X clusters..."
  - "Detecting and merging duplicate nodes..."
  - "Generated X nodes successfully"
- Proposals appear in "Review Proposals" tab when complete
- Progress bar disappears when complete

**Pass Criteria**: ✅ Progress bar moves smoothly, status messages are accurate, proposals appear

---

### 2. Multi-Tab Consistency

**Objective**: Verify progress is shared across multiple browser tabs.

**Steps**:
1. Start proposal generation in Tab A
2. Wait until progress reaches ~30%
3. Open new tab (Tab B) and navigate to the same import page
4. Observe progress in Tab B
5. Continue watching both tabs

**Expected Results**:
- Tab B immediately shows the same progress as Tab A
- Both tabs update simultaneously as progress advances
- Both tabs show completion at the same time
- Both tabs show the same status messages

**Pass Criteria**: ✅ Both tabs show identical progress, updates are synchronized

---

### 3. Page Refresh During Generation

**Objective**: Verify progress resumes correctly after page refresh.

**Steps**:
1. Start proposal generation
2. Wait until progress reaches ~50%
3. Refresh the page (F5 or Ctrl+R)
4. Observe the page after refresh

**Expected Results**:
- Page loads normally
- "Resume Generation" banner appears at the top
- Progress bar shows the correct percentage (around 50%)
- Status message shows current stage
- Progress continues from where it left off
- Generation completes successfully

**Pass Criteria**: ✅ Progress resumes correctly, no data loss, completion works

---

### 4. Browser Restart Recovery

**Objective**: Verify progress persists through browser restart.

**Steps**:
1. Start proposal generation
2. Wait until progress reaches ~25%
3. Close the browser completely
4. Reopen browser and navigate to the import page
5. Observe the page

**Expected Results**:
- "Resume Generation" banner appears
- Progress shows correct percentage (around 25%)
- Status message shows current stage
- Progress continues from where it left off
- Generation completes successfully

**Pass Criteria**: ✅ Progress persists through browser restart, recovery works

---

### 5. Error Handling

**Objective**: Verify error states are handled correctly.

**Steps**:
1. Start proposal generation
2. If generation fails naturally, observe error handling
3. OR simulate error by stopping the server during generation
4. Refresh the page

**Expected Results**:
- Error message is displayed clearly
- Progress bar shows error state
- localStorage is cleared of the failed job
- User can retry generation
- No phantom progress bars remain

**Pass Criteria**: ✅ Errors are handled gracefully, cleanup works, retry possible

---

### 6. Tree Building Progress

**Objective**: Verify tree building progress works with the same system.

**Steps**:
1. Generate some proposals first
2. Go to "Review Proposals" tab
3. Select some proposals
4. Click "Build Tree"
5. Observe progress bar

**Expected Results**:
- Tree building progress bar appears
- Progress moves through 7 stages:
  - "Starting tree build..."
  - "Fetching proposals..."
  - "Creating experiment tree..."
  - "Analyzing dependencies and organizing..."
  - "Creating workflow blocks..."
  - "Creating tree nodes..."
  - "Creating node content..."
- Progress reaches 100% and tree is created
- Redirects to the new tree

**Pass Criteria**: ✅ Tree building progress works, all stages visible, completion works

---

### 7. SSE Reliability

**Objective**: Verify Server-Sent Events work reliably.

**Steps**:
1. Start proposal generation
2. Monitor browser developer console for SSE messages
3. Check connection status indicator (green/red dot)
4. If connection drops, verify auto-reconnect

**Expected Results**:
- Console shows SSE connection established
- Progress updates arrive via SSE (not polling)
- Connection indicator shows green when connected
- Auto-reconnect works if connection drops
- No excessive network requests (no polling)

**Pass Criteria**: ✅ SSE works reliably, auto-reconnect functions, no polling

---

### 8. Cross-Session Persistence

**Objective**: Verify progress persists across different user sessions.

**Steps**:
1. Start proposal generation in one browser session
2. Open a different browser (or incognito mode)
3. Login with the same account
4. Navigate to the same import page
5. Observe progress

**Expected Results**:
- Second session shows the same progress
- Both sessions update simultaneously
- Progress is truly server-side, not just localStorage

**Pass Criteria**: ✅ Progress is shared across sessions, truly server-side

---

## Performance Testing

### Database Load
- Monitor database queries during progress updates
- Verify in-memory cache reduces DB load
- Check that progress updates don't cause performance issues

### Network Efficiency
- Verify SSE reduces network requests compared to polling
- Check that progress updates are efficient
- Monitor for any memory leaks in long-running generations

## Edge Cases

### Concurrent Generations
1. Start proposal generation
2. Try to start another generation (should be prevented or queued)
3. Verify only one generation runs at a time

### Large Datasets
1. Test with large numbers of files
2. Verify progress scales correctly
3. Check that status messages remain informative

### Network Interruption
1. Start generation
2. Disconnect network temporarily
3. Reconnect and verify progress resumes

## Troubleshooting

### Common Issues

**Progress bar stuck at 0%**:
- Check browser console for errors
- Verify SSE connection is established
- Check if job was created in database

**Progress not shared across tabs**:
- Verify localStorage is working
- Check if jobId is being stored correctly
- Verify SSE is broadcasting to all tabs

**Progress not resuming after refresh**:
- Check localStorage for stored jobId
- Verify job still exists in database
- Check if progress API endpoint is working

### Debug Commands

```javascript
// Check localStorage
localStorage.getItem('active_proposal_job_rna-seq-pipeline')

// Check current job state
console.log('Current job ID:', currentJobId)
console.log('Generation progress:', generationProgress)
console.log('Generation status:', generationStatus)

// Check SSE connection
console.log('SSE connected:', sseConnected)
```

## Success Criteria Summary

- ✅ Progress bar updates in real-time across all tabs
- ✅ Progress persists through page refreshes
- ✅ Progress resumes after browser restart
- ✅ No phantom progress bars (old jobs cleaned up)
- ✅ SSE delivers progress updates reliably
- ✅ Proposal nodes appear in real-time without refresh
- ✅ Tree building shows accurate progress
- ✅ All manual tests pass
- ✅ Zero regression in existing functionality

## Reporting Issues

When reporting issues, include:
1. Browser and version
2. Steps to reproduce
3. Expected vs actual behavior
4. Console errors (if any)
5. Network tab showing SSE messages
6. Screenshots of progress bar state
