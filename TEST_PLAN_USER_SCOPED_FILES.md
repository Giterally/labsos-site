# Test Plan: User-Scoped Files and Project-Scoped Proposals

## Prerequisites
1. **Apply Database Migrations** (if not already applied):
   - Migration 045: `migrations/045_user_scoped_files_project_scoped_proposals.sql`
   - Migration 046: `migrations/046_create_user_uploads_bucket.sql`

2. **Verify Database Schema**:
   - `ingestion_sources` should have `user_id` (NOT NULL) and `project_id` (nullable)
   - `chunks` should have `user_id` (NOT NULL) and `project_id` (nullable)
   - `proposed_nodes` should have both `user_id` (NOT NULL) and `project_id` (NOT NULL)
   - `structured_documents` should have `user_id` (NOT NULL) and `project_id` (nullable)
   - Storage bucket `user-uploads` should exist with RLS policies

## Test Scenarios

### Test 1: File Upload - User Isolation
**Objective**: Verify files are user-scoped and not visible to other users

**Steps**:
1. Login as User A
2. Create Project A
3. Upload a file (e.g., `test-user-a.pdf`) in Project A
4. Logout
5. Login as User B
6. Create Project B
7. Navigate to Import page in Project B

**Expected Results**:
- ✅ User B should NOT see `test-user-a.pdf` in their file list
- ✅ User B should only see files they uploaded
- ✅ File count should be 0 for User B

**Verification**:
- Check database: `SELECT * FROM ingestion_sources WHERE user_id = '<user-a-id>'` should show the file
- Check database: `SELECT * FROM ingestion_sources WHERE user_id = '<user-b-id>'` should NOT show User A's file

---

### Test 2: File Sharing Across Projects (Same User)
**Objective**: Verify files uploaded in one project are visible in all user's projects

**Steps**:
1. Login as User A
2. Create Project A
3. Upload a file (e.g., `shared-file.pdf`) in Project A
4. Wait for file to process (status = 'completed')
5. Navigate to Project B (create if needed, same user)
6. Go to Import page in Project B

**Expected Results**:
- ✅ User A should see `shared-file.pdf` in Project B's import page
- ✅ File should be available for proposal generation in Project B
- ✅ File count should be 1 in both projects

**Verification**:
- Check database: `SELECT * FROM ingestion_sources WHERE user_id = '<user-a-id>'` should show the file with `project_id = NULL`
- Check storage: File should be in `user-uploads/<user-a-id>/` bucket

---

### Test 3: Proposal Generation - Project Isolation
**Objective**: Verify proposals are per-user, per-project

**Steps**:
1. Login as User A
2. Upload a file `test.pdf` (wait for completion)
3. Create Project A
4. Select `test.pdf` for proposal generation
5. Generate proposals in Project A
6. Create Project B (same user)
7. Navigate to Project B's Import page
8. Check proposals

**Expected Results**:
- ✅ Project A should have proposals generated from `test.pdf`
- ✅ Project B should have NO proposals (empty list)
- ✅ Proposals in Project A should reference `test.pdf` as source

**Verification**:
- Check database: `SELECT * FROM proposed_nodes WHERE user_id = '<user-a-id>' AND project_id = '<project-a-id>'` should show proposals
- Check database: `SELECT * FROM proposed_nodes WHERE user_id = '<user-a-id>' AND project_id = '<project-b-id>'` should be empty

---

### Test 4: Proposal Generation - User Isolation
**Objective**: Verify User B cannot see User A's proposals in the same project

**Steps**:
1. Login as User A
2. Create Project A (or use existing)
3. Upload file and generate proposals
4. Logout
5. Login as User B
6. Navigate to Project A (if User B has access)
7. Check proposals

**Expected Results**:
- ✅ User B should NOT see User A's proposals
- ✅ User B should see empty proposals list (or only their own proposals if they generated any)

**Verification**:
- Check database: Proposals should have `user_id = '<user-a-id>'` and `project_id = '<project-a-id>'`
- User B's query should filter by their own `user_id`, so they won't see User A's proposals

---

### Test 5: File Selection for Proposal Generation
**Objective**: Verify user can select specific files for proposal generation

**Steps**:
1. Login as User A
2. Upload 3 files: `file1.pdf`, `file2.pdf`, `file3.pdf`
3. Wait for all files to process
4. Create Project A
5. Go to Import page → Manage Files tab
6. Select only `file1.pdf` and `file2.pdf` (checkboxes for proposal generation)
7. Click "Generate AI Proposals"

**Expected Results**:
- ✅ Only `file1.pdf` and `file2.pdf` should be used for proposal generation
- ✅ Proposals should reference chunks from `file1.pdf` and `file2.pdf` only
- ✅ `file3.pdf` should NOT be used in proposals

**Verification**:
- Check proposal metadata: `provenance.sources` should only include `file1.pdf` and `file2.pdf` source IDs
- Check chunks: Only chunks from selected sources should be used in RAG retrieval

---

### Test 6: Cloud Storage Import - User Scoping
**Objective**: Verify cloud imports are user-scoped

**Steps**:
1. Login as User A
2. Connect Google Drive account
3. Import a file from Google Drive in Project A
4. Logout
5. Login as User B
6. Navigate to Project B
7. Check file list

**Expected Results**:
- ✅ User B should NOT see User A's Google Drive imported file
- ✅ User B should only see their own imported files

**Verification**:
- Check database: `ingestion_sources` should have `user_id = '<user-a-id>'` for User A's imports
- Check storage: Files should be in `user-uploads/<user-a-id>/` for User A

---

### Test 7: File Deletion - Cross-Project Impact
**Objective**: Verify deleting a file removes it from all projects

**Steps**:
1. Login as User A
2. Upload `test-delete.pdf` in Project A
3. Navigate to Project B (same user)
4. Verify `test-delete.pdf` is visible
5. Delete `test-delete.pdf` from Project B
6. Navigate back to Project A
7. Check file list

**Expected Results**:
- ✅ File should be deleted from Project A as well
- ✅ File should be removed from storage
- ✅ File should be removed from database

**Verification**:
- Check database: `SELECT * FROM ingestion_sources WHERE source_name = 'test-delete.pdf'` should return empty
- Check storage: File should not exist in `user-uploads/<user-a-id>/`

---

### Test 8: Proposal Regeneration - Replacement
**Objective**: Verify regenerating proposals replaces existing ones

**Steps**:
1. Login as User A
2. Upload `file1.pdf` and generate proposals in Project A
3. Note the proposal count (e.g., 5 proposals)
4. Upload `file2.pdf` (wait for completion)
5. Select both `file1.pdf` and `file2.pdf`
6. Click "Regenerate AI Proposals"

**Expected Results**:
- ✅ Old proposals (from step 3) should be deleted
- ✅ New proposals should be generated from both files
- ✅ Proposal count may be different (more or less)
- ✅ All proposals should have `user_id = '<user-a-id>'` and `project_id = '<project-a-id>'`

**Verification**:
- Check database: Old proposals should be deleted before new ones are created
- Check database: New proposals should have both `user_id` and `project_id` set correctly

---

### Test 9: Tree Building - Project Scoping
**Objective**: Verify tree building uses proposals from specific project

**Steps**:
1. Login as User A
2. Upload files and generate proposals in Project A (e.g., 5 proposals)
3. Create Project B
4. Upload different files and generate proposals in Project B (e.g., 3 proposals)
5. In Project A, select all proposals and build tree
6. In Project B, select all proposals and build tree

**Expected Results**:
- ✅ Project A's tree should only use Project A's proposals (5 proposals)
- ✅ Project B's tree should only use Project B's proposals (3 proposals)
- ✅ Trees should be independent

**Verification**:
- Check database: `experiment_trees` should have separate trees for each project
- Check tree nodes: Each tree should reference only its project's proposals

---

### Test 10: Multiple Users, Same Project
**Objective**: Verify multiple users can work in the same project independently

**Steps**:
1. Login as User A
2. Create Project A (or use existing shared project)
3. Upload `user-a-file.pdf` and generate proposals
4. Logout
5. Login as User B
6. Navigate to Project A (if User B has access)
7. Upload `user-b-file.pdf` and generate proposals

**Expected Results**:
- ✅ User A should see their own files and proposals
- ✅ User B should see their own files and proposals
- ✅ User A should NOT see User B's files
- ✅ User B should NOT see User A's files
- ✅ Both users can generate proposals independently in the same project

**Verification**:
- Check database: Files should be scoped by `user_id`
- Check database: Proposals should be scoped by both `user_id` and `project_id`

---

## Edge Cases to Test

### Edge Case 1: Empty File Selection
- Try to generate proposals without selecting any files
- Expected: Error message "Please select at least one completed file"

### Edge Case 2: File Processing Failure
- Upload a corrupted file
- Expected: File status should be 'failed', should not appear in proposal generation selection

### Edge Case 3: Concurrent Proposal Generation
- Start proposal generation, then immediately start another
- Expected: First generation should be cancelled or queued properly

### Edge Case 4: Large File Count
- Upload 50+ files
- Expected: File list should load and display correctly
- Expected: File selection UI should work with many files

---

## Database Verification Queries

```sql
-- Check file scoping
SELECT id, source_name, user_id, project_id 
FROM ingestion_sources 
ORDER BY created_at DESC 
LIMIT 10;

-- Check proposal scoping
SELECT id, user_id, project_id, status, created_at 
FROM proposed_nodes 
ORDER BY created_at DESC 
LIMIT 10;

-- Check chunk scoping
SELECT id, user_id, project_id, source_type 
FROM chunks 
ORDER BY created_at DESC 
LIMIT 10;

-- Verify user_id is set for all files
SELECT COUNT(*) as total, 
       COUNT(user_id) as with_user_id,
       COUNT(project_id) as with_project_id
FROM ingestion_sources;

-- Verify proposals have both user_id and project_id
SELECT COUNT(*) as total,
       COUNT(user_id) as with_user_id,
       COUNT(project_id) as with_project_id
FROM proposed_nodes;
```

---

## Checklist

- [ ] Migration 045 applied
- [ ] Migration 046 applied
- [ ] Test 1: File Upload - User Isolation ✅
- [ ] Test 2: File Sharing Across Projects ✅
- [ ] Test 3: Proposal Generation - Project Isolation ✅
- [ ] Test 4: Proposal Generation - User Isolation ✅
- [ ] Test 5: File Selection for Proposal Generation ✅
- [ ] Test 6: Cloud Storage Import - User Scoping ✅
- [ ] Test 7: File Deletion - Cross-Project Impact ✅
- [ ] Test 8: Proposal Regeneration - Replacement ✅
- [ ] Test 9: Tree Building - Project Scoping ✅
- [ ] Test 10: Multiple Users, Same Project ✅
- [ ] All edge cases tested ✅

---

## Notes

- Files are stored in `user-uploads/<userId>/` bucket
- Files have `project_id = NULL` in database
- Proposals have both `user_id` and `project_id` set
- Chunks are user-scoped but can be filtered by `selectedSourceIds` during proposal generation
- RAG retrieval filters by `user_id` and optionally by `selectedSourceIds`

