# Manual Testing Guide: User-Scoped Files and Project-Scoped Proposals

## Prerequisites
- Dev server running on `localhost:3000`
- At least 2 test user accounts
- Browser with incognito/private mode for second user

---

## Test 1: File Upload - User Isolation ✅

### Steps:
1. **Login as User A**
   - Open browser → `http://localhost:3000`
   - Login with User A credentials
   - Create or navigate to Project A

2. **Upload File in Project A**
   - Go to Import page: `/dashboard/projects/[projectId]/import`
   - Click "Upload Files" tab
   - Upload a test file: `test-user-a.pdf`
   - Wait for processing to complete (status = 'completed')

3. **Logout and Login as User B**
   - Logout from User A
   - Open incognito window (or different browser)
   - Login with User B credentials
   - Create or navigate to Project B

4. **Verify User B Cannot See User A's File**
   - Go to Import page in Project B
   - Check "Manage Files" tab
   - **Expected**: `test-user-a.pdf` should NOT be visible
   - File count should be 0 (or only User B's files)

### Verification Query:
```sql
-- Check files by user
SELECT id, source_name, user_id, project_id, status
FROM ingestion_sources
ORDER BY created_at DESC
LIMIT 10;
```

---

## Test 2: File Sharing Across Projects (Same User) ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Navigate to Project A

2. **Upload File in Project A**
   - Upload `shared-file.pdf` in Project A
   - Wait for processing (status = 'completed')

3. **Navigate to Project B (Same User)**
   - Create or navigate to Project B (same user, different project)
   - Go to Import page

4. **Verify File is Visible in Project B**
   - Check "Manage Files" tab
   - **Expected**: `shared-file.pdf` should be visible
   - File should be available for proposal generation

### Verification Query:
```sql
-- Check file has user_id but project_id is NULL
SELECT id, source_name, user_id, project_id
FROM ingestion_sources
WHERE source_name = 'shared-file.pdf';
-- Expected: user_id = User A's ID, project_id = NULL
```

---

## Test 3: Proposal Generation - Project Isolation ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Upload `test-proposal.pdf` (wait for completion)

2. **Generate Proposals in Project A**
   - Navigate to Project A → Import page
   - Select `test-proposal.pdf` (checkbox for proposal generation)
   - Click "Generate AI Proposals"
   - Wait for generation to complete
   - Note the proposal count (e.g., 5 proposals)

3. **Navigate to Project B (Same User)**
   - Go to Project B → Import page
   - Check "Review Proposals" tab

4. **Verify Proposals are NOT in Project B**
   - **Expected**: Proposals list should be empty
   - No proposals should be visible

### Verification Query:
```sql
-- Check proposals are scoped by user_id AND project_id
SELECT id, user_id, project_id, status, created_at
FROM proposed_nodes
WHERE user_id = '<user-a-id>'
ORDER BY created_at DESC;
-- Expected: Proposals should have both user_id and project_id set
```

---

## Test 4: Proposal Generation - User Isolation ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Navigate to Project A
   - Upload file and generate proposals
   - Note proposal count

2. **Logout and Login as User B**
   - Logout from User A
   - Login with User B
   - Navigate to Project A (if User B has access)

3. **Verify User B Cannot See User A's Proposals**
   - Go to Import page → "Review Proposals" tab
   - **Expected**: User B should NOT see User A's proposals
   - Proposals list should be empty (or only User B's proposals)

### Verification Query:
```sql
-- Check proposals filtered by user_id
SELECT COUNT(*) as user_a_proposals
FROM proposed_nodes
WHERE user_id = '<user-a-id>' AND project_id = '<project-a-id>';

SELECT COUNT(*) as user_b_proposals
FROM proposed_nodes
WHERE user_id = '<user-b-id>' AND project_id = '<project-a-id>';
```

---

## Test 5: File Selection for Proposal Generation ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Upload 3 files: `file1.pdf`, `file2.pdf`, `file3.pdf`
   - Wait for all to process (status = 'completed')

2. **Select Specific Files**
   - Go to Import page → "Manage Files" tab
   - Select only `file1.pdf` and `file2.pdf` (checkboxes for proposal generation)
   - Leave `file3.pdf` unchecked

3. **Generate Proposals**
   - Click "Generate AI Proposals"
   - Wait for generation to complete

4. **Verify Only Selected Files Used**
   - Check proposals in "Review Proposals" tab
   - Expand a proposal and check metadata
   - **Expected**: Proposals should reference chunks from `file1.pdf` and `file2.pdf` only
   - `file3.pdf` should NOT be used

### Verification Query:
```sql
-- Check proposal provenance sources
SELECT id, 
       provenance->'sources' as sources,
       node_json->'title' as title
FROM proposed_nodes
WHERE user_id = '<user-a-id>' AND project_id = '<project-a-id>'
ORDER BY created_at DESC
LIMIT 5;
-- Expected: sources array should only contain file1.pdf and file2.pdf source IDs
```

---

## Test 6: Cloud Storage Import - User Scoping ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Navigate to Project A

2. **Import from Cloud Storage**
   - Go to Import page → "Cloud Storage" tab
   - Connect Google Drive (or Dropbox/OneDrive)
   - Select and import a file: `cloud-file-user-a.pdf`
   - Wait for processing

3. **Logout and Login as User B**
   - Logout from User A
   - Login with User B
   - Navigate to Project B

4. **Verify User B Cannot See User A's Cloud Import**
   - Go to Import page → "Manage Files" tab
   - **Expected**: `cloud-file-user-a.pdf` should NOT be visible

### Verification Query:
```sql
-- Check cloud imports are user-scoped
SELECT id, source_name, user_id, project_id, metadata->>'provider' as provider
FROM ingestion_sources
WHERE metadata->>'provider' IS NOT NULL
ORDER BY created_at DESC;
-- Expected: Each file should have user_id set, project_id = NULL
```

---

## Test 7: File Deletion - Cross-Project Impact ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Upload `test-delete.pdf` in Project A
   - Wait for processing

2. **Verify File in Project B**
   - Navigate to Project B (same user)
   - Check "Manage Files" tab
   - **Expected**: `test-delete.pdf` should be visible

3. **Delete File from Project B**
   - Select `test-delete.pdf` in Project B
   - Click delete/remove
   - Confirm deletion

4. **Verify File Deleted from Project A**
   - Navigate back to Project A
   - Check "Manage Files" tab
   - **Expected**: `test-delete.pdf` should NOT be visible
   - File should be removed from storage

### Verification Query:
```sql
-- Check file is deleted
SELECT COUNT(*) as file_count
FROM ingestion_sources
WHERE source_name = 'test-delete.pdf';
-- Expected: 0

-- Check storage (if accessible)
-- File should not exist in user-uploads/<user-id>/
```

---

## Test 8: Multiple Users, Same Project ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Navigate to Project A (shared project)
   - Upload `user-a-file.pdf`
   - Generate proposals

2. **Logout and Login as User B**
   - Logout from User A
   - Login with User B
   - Navigate to Project A (same project)
   - Upload `user-b-file.pdf`
   - Generate proposals

3. **Verify Isolation**
   - **User A's view**: Should see `user-a-file.pdf` and their proposals
   - **User B's view**: Should see `user-b-file.pdf` and their proposals
   - **Expected**: Each user should only see their own files and proposals

### Verification Query:
```sql
-- Check files by user in same project
SELECT user_id, source_name, project_id
FROM ingestion_sources
WHERE project_id IS NULL
ORDER BY created_at DESC;

-- Check proposals by user in same project
SELECT user_id, project_id, COUNT(*) as proposal_count
FROM proposed_nodes
WHERE project_id = '<project-a-id>'
GROUP BY user_id, project_id;
-- Expected: Separate counts for each user
```

---

## Test 9: Proposal Regeneration - Replacement ✅

### Steps:
1. **Login as User A**
   - Login with User A
   - Upload `file1.pdf` and generate proposals
   - Note proposal count (e.g., 5 proposals)

2. **Upload Additional File**
   - Upload `file2.pdf` (wait for completion)

3. **Regenerate Proposals**
   - Select both `file1.pdf` and `file2.pdf`
   - Click "Regenerate AI Proposals"
   - Confirm replacement

4. **Verify Old Proposals Replaced**
   - Check "Review Proposals" tab
   - **Expected**: Old proposals should be deleted
   - New proposals should be generated from both files
   - Proposal count may be different

### Verification Query:
```sql
-- Check proposal timestamps
SELECT id, user_id, project_id, created_at
FROM proposed_nodes
WHERE user_id = '<user-a-id>' AND project_id = '<project-a-id>'
ORDER BY created_at DESC;
-- Expected: All proposals should have recent timestamps (after regeneration)
```

---

## Test 10: Storage Path Verification ✅

### Steps:
1. **Upload File**
   - Login as User A
   - Upload `storage-test.pdf`

2. **Verify Storage Path**
   - Check database: `ingestion_sources.storage_path`
   - **Expected**: Path should be `{user_id}/{filename}`
   - Should NOT include project_id

### Verification Query:
```sql
-- Check storage paths
SELECT id, source_name, user_id, project_id, storage_path
FROM ingestion_sources
ORDER BY created_at DESC
LIMIT 5;
-- Expected: storage_path should be '{user_id}/{filename}', project_id = NULL
```

---

## Quick Verification Checklist

After running tests, verify:

- [ ] Files have `user_id` set, `project_id` = NULL
- [ ] Files are visible across all user's projects
- [ ] Files are NOT visible to other users
- [ ] Proposals have both `user_id` AND `project_id` set
- [ ] Proposals are isolated per project
- [ ] Proposals are isolated per user
- [ ] File deletion removes from all projects
- [ ] Storage paths use `user-uploads/{user_id}/`
- [ ] Cloud imports are user-scoped
- [ ] File selection works for proposal generation

---

## Common Issues to Watch For

1. **Files visible to wrong user**: Check `user_id` in `ingestion_sources`
2. **Proposals visible in wrong project**: Check both `user_id` and `project_id` in `proposed_nodes`
3. **Storage errors**: Verify `user-uploads` bucket exists and RLS policies are correct
4. **File not processing**: Check `status` and `error_message` in `ingestion_sources`
5. **Proposals not generating**: Check file selection and `selectedSourceIds` parameter

---

## Database Verification Queries

```sql
-- Overall health check
SELECT 
  'ingestion_sources' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE project_id IS NULL) as user_scoped,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) as project_scoped
FROM ingestion_sources
UNION ALL
SELECT 
  'proposed_nodes' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE project_id IS NULL) as user_scoped,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) as project_scoped
FROM proposed_nodes
UNION ALL
SELECT 
  'chunks' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE project_id IS NULL) as user_scoped,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) as project_scoped
FROM chunks;
```

