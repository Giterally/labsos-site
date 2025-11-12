<!-- c0817977-ac4c-4192-b77f-87e6f1a0c214 e829eb51-e04d-42cc-a3a3-ff74c2c72d67 -->
# User-Scoped Files and Project-Scoped Proposals Implementation

## Overview

Transform the system to have:

- **Files & Chunks**: User-scoped (shared across all user's projects, like cloud provider logins)
- **Proposals**: Per-user, per-project (isolated per project)
- **Tree Building**: Uses proposals from specific user+project combination

## Database Migrations

### Migration 045: Make files and chunks user-scoped, keep proposals per-user-per-project

**File**: `migrations/045_user_scoped_files_project_scoped_proposals.sql`

**Changes**:

1. **ingestion_sources**: Make `project_id` nullable, add `user_id` required
2. **chunks**: Make `project_id` nullable, add `user_id` required, set all `project_id` to NULL
3. **proposed_nodes**: Keep `project_id` required, add `user_id` required
4. **structured_documents**: Make `project_id` nullable, add `user_id` required
5. Update indexes for new schema
6. Update `match_chunks` function to use `user_id` and optional `source_ids` filter

### Migration 046: Create user-uploads storage bucket

**File**: `migrations/046_create_user_uploads_bucket.sql`

**Changes**:

1. Create `user-uploads` storage bucket
2. Create RLS policies for user-scoped file access
3. Update storage policies to use `user_id` instead of `project_id`

## API Route Updates

### Import Routes (Remove project_id requirement)

Files to update:

- `app/api/import/upload/route.ts`
- `app/api/import/googledrive/import/route.ts`
- `app/api/import/onedrive/import/route.ts`
- `app/api/import/dropbox/import/route.ts`
- `app/api/import/github/route.ts`

**Changes**:

- Remove `projectId` from request body validation
- Use `user.id` from authenticated session
- Update storage path: `user-uploads/${userId}/${filename}`
- Store `user_id` in `ingestion_sources`, set `project_id` to NULL

### Sources API Route

**File**: `app/api/projects/[projectId]/sources/route.ts`

**Changes**:

- GET: Fetch sources by `user_id` (all user's files, not project files)
- DELETE: Delete by `user_id` (removes from all projects)

### Proposals API Route

**File**: `app/api/projects/[projectId]/proposals/route.ts`

**Changes**:

- GET: Fetch proposals by `user_id` + `project_id` combination
- POST (generate): Accept `selectedSourceIds[]` parameter, delete existing proposals for `user_id` + `project_id`, store new proposals with both `user_id` and `project_id`
- POST (tree build): Fetch proposals by `user_id` + `project_id`, build tree into `project_id`

## Processing Pipeline Updates

### Preprocessing Pipeline

**File**: `lib/processing/preprocessing-pipeline.ts`

**Changes**:

- Update `preprocessFile(sourceId: string, projectId: string)` → `preprocessFile(sourceId: string, userId: string)`
- Get `user_id` from source record
- Store chunks with `user_id`, set `project_id` to NULL
- Update `structured_documents` to use `user_id` instead of `project_id`

### RAG Retriever

**File**: `lib/ai/rag-retriever.ts`

**Changes**:

- Update `retrieveContextForSynthesis` to accept `userId` and `selectedSourceIds[]`
- Update `getPrimaryChunks` to filter by `user_id` AND `selectedSourceIds`
- Update vector search calls to use `user_id_filter` and `source_ids_filter`

### Embedding Storage

**File**: `lib/ai/embeddings.ts`

**Changes**:

- Update `storeEmbeddings` to use `userId` instead of `projectId`
- Store chunks with `user_id`, `project_id = NULL`

### Proposal Generation

**File**: `lib/ai/synthesis.ts`

**Changes**:

- Update `storeSynthesizedNode` to accept both `userId` and `projectId`
- Store proposals with both `user_id` and `project_id` (required)

## Frontend Updates

### Import Page

**File**: `app/dashboard/projects/[projectId]/import/page.tsx`

**Changes**:

- Remove `projectId` from import API calls (files are user-scoped)
- Update `fetchData()` to fetch user-scoped sources (all user's files)
- Update proposal fetching to filter by `user_id` + `project_id`
- Add file selection UI for proposal generation:
- Add checkboxes to file list in "Manage Files" tab
- Add "Select Files for Proposals" button/mode
- Show selected file count
- Pass `selectedSourceIds[]` to proposal generation API
- Update "Generate Proposals" to require file selection
- Update file deletion warning: "This will delete the file from all your projects"
- Keep project context for proposal generation and tree building

### Inngest Functions

**File**: `lib/inngest/functions.ts`

**Changes**:

- Update `processChunks` to use `userId` instead of `projectId`
- Update chunk storage to use `user_id`

## Migration Tracking

**File**: `migrations/045_user_scoped_files_project_scoped_proposals_TRACKING.md`

**Content**: Document before/after schema for:

- `ingestion_sources` table
- `chunks` table
- `proposed_nodes` table
- `structured_documents` table
- `match_chunks` function
- All affected indexes

## Testing Checklist

1. File upload stores with `user_id`, `project_id = NULL`
2. File visible in all user's projects
3. File processing creates chunks with `user_id`, `project_id = NULL`
4. File selection UI works for proposal generation
5. Proposal generation uses only selected files' chunks
6. Proposals stored with `user_id` + `project_id`
7. Proposals isolated per project
8. Proposal regeneration deletes old proposals for that project
9. Tree building uses proposals from specific user+project
10. File deletion removes from all projects
11. RAG retrieval filters by `user_id` and `selectedSourceIds`
12. Vector search function works with new parameters

### To-dos

- [ ] Create migration 045: Update ingestion_sources, chunks, proposed_nodes, structured_documents tables
- [ ] Create migration 046: Create user-uploads storage bucket with RLS policies
- [ ] Create migration tracking document with before/after schema
- [ ] Update all import API routes to use user_id instead of project_id
- [ ] Update preprocessing pipeline to use user_id
- [ ] Update RAG retriever to accept userId and selectedSourceIds
- [ ] Update proposal generation to accept selectedSourceIds and store with user_id + project_id
- [ ] Update frontend import page to show user-scoped files and add file selection UI
- [ ] Update sources API route to fetch by user_id
- [ ] Update proposals API route to handle user_id + project_id filtering
- [ ] Update tree building to use user_id + project_id for proposals
- [ ] Update Inngest functions to use user_id