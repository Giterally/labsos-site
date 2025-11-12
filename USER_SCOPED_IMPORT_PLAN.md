# User-Scoped Files, Project-Scoped Proposals Implementation Plan

## Overview
Transform the import and processing system to have:
- **Files**: User-scoped (shared across all projects, like cloud provider logins)
- **Proposals**: Per-user, per-project (isolated per project)
- **Tree Building**: Uses proposals from specific user+project combination

This allows users to:
- Upload/import files once (shared across all their projects)
- Select files from their entire library to generate proposals for a specific project
- Have separate proposal pipelines per project
- Build trees using only proposals from that specific project

## Current Architecture

### Database Tables (Project-Scoped)
1. **ingestion_sources**: `project_id` (required), `created_by` (user_id)
2. **chunks**: `project_id` (required)
3. **proposed_nodes**: `project_id` (required), `created_by` (user_id)
4. **Storage**: `project-uploads/${projectId}/${filename}`

### Current Flow
1. User uploads file → stored with `project_id`
2. File processed → chunks stored with `project_id`
3. Proposals generated → stored with `project_id`
4. Tree built → uses proposals from that `project_id`

## Target Architecture

### Database Tables
1. **ingestion_sources**: `user_id` (required), `project_id` (NULL - files are user-scoped), `created_by` (user_id)
2. **chunks**: `user_id` (required), `project_id` (NULL - chunks are user-scoped), `source_id` (links to ingestion_sources)
3. **proposed_nodes**: `user_id` (required), `project_id` (required - proposals are per-user, per-project), `created_by` (user_id)
4. **Storage**: `user-uploads/${userId}/${filename}` (user-scoped, shared across projects)

### Target Flow
1. User uploads file → stored with `user_id`, `project_id = NULL` (shared across all projects)
2. File processed → chunks stored with `user_id`, `project_id = NULL` (linked to source via `source_id`)
3. User selects files from their library → generates proposals → stored with `user_id` + `project_id` (project-specific)
4. RAG retrieval for proposals → only uses chunks from selected files
5. Tree built → uses proposals from specific `user_id` + `project_id` combination
6. File deletion → removes from all projects (since files are shared)

## Implementation Steps

### Phase 1: Database Migrations

#### Migration 1: Update ingestion_sources
```sql
-- Make project_id nullable, add user_id as required
ALTER TABLE ingestion_sources 
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: set user_id from created_by
UPDATE ingestion_sources 
SET user_id = created_by 
WHERE user_id IS NULL;

-- Make user_id required after migration
ALTER TABLE ingestion_sources 
  ALTER COLUMN user_id SET NOT NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_ingestion_sources_project_id;
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_user_id ON ingestion_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_project_id ON ingestion_sources(project_id) WHERE project_id IS NOT NULL;
```

#### Migration 2: Update chunks
```sql
-- Make project_id nullable, add user_id as required
ALTER TABLE chunks 
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: get user_id from ingestion_sources
UPDATE chunks c
SET user_id = s.created_by
FROM ingestion_sources s
WHERE c.source_ref->>'sourceId' = s.id::text
  AND c.user_id IS NULL;

-- Set project_id to NULL for all chunks (chunks are user-scoped, not project-scoped)
UPDATE chunks SET project_id = NULL;

-- Make user_id required after migration
ALTER TABLE chunks 
  ALTER COLUMN user_id SET NOT NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_chunks_project_id;
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON chunks((source_ref->>'sourceId')) WHERE source_ref->>'sourceId' IS NOT NULL;
```

#### Migration 3: Update proposed_nodes
```sql
-- Keep project_id required, add user_id as required
-- Proposals are per-user, per-project (both required)
ALTER TABLE proposed_nodes 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: set user_id from created_by
UPDATE proposed_nodes 
SET user_id = created_by 
WHERE user_id IS NULL;

-- Make user_id required after migration
ALTER TABLE proposed_nodes 
  ALTER COLUMN user_id SET NOT NULL;

-- Update indexes (keep project_id index, add user_id index, add composite index)
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_user_id ON proposed_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_user_project ON proposed_nodes(user_id, project_id);
```

#### Migration 4: Update vector search function
```sql
-- Update match_chunks function to use user_id and optional source_id filter
-- This allows filtering by user AND by selected source IDs for proposal generation
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  user_id_filter uuid,
  source_ids_filter uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  text text,
  source_type text,
  source_ref jsonb,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.text,
    c.source_type,
    c.source_ref,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  FROM chunks c
  WHERE c.user_id = user_id_filter
    AND c.embedding IS NOT NULL
    AND (source_ids_filter IS NULL OR (c.source_ref->>'sourceId')::uuid = ANY(source_ids_filter))
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### Phase 2: API Route Updates

#### 2.1 Import Routes (Remove project_id requirement)
Files to update:
- `app/api/import/upload/route.ts`
- `app/api/import/googledrive/import/route.ts`
- `app/api/import/onedrive/import/route.ts`
- `app/api/import/dropbox/import/route.ts`
- `app/api/import/github/route.ts`

Changes:
- Remove `projectId` from request body (files are user-scoped, not project-scoped)
- Use `user.id` from authenticated session instead
- Update storage path: `user-uploads/${userId}/${filename}` instead of `project-uploads/${projectId}/${filename}`
- Store `user_id` in `ingestion_sources`, set `project_id` to NULL
- Files are shared across all user's projects

#### 2.2 Storage Bucket
- Option A: Create new bucket `user-uploads` (recommended)
- Option B: Keep `project-uploads` but use `userId` in path
- Update all upload code to use new bucket/path structure

#### 2.3 Preprocessing Pipeline
File: `lib/processing/preprocessing-pipeline.ts`

Changes:
- Update `preprocessFile(sourceId: string, projectId: string)` → `preprocessFile(sourceId: string, userId: string)`
- Get `user_id` from source record instead of parameter
- Store chunks with `user_id` instead of `project_id`
- Update `structured_documents` if it has `project_id`

#### 2.4 Proposal Generation
Files to check:
- `lib/ai/synthesis.ts`
- `app/api/projects/[projectId]/proposals/route.ts`

Changes:
- **Accept selected source IDs** from frontend (user selects which files to use)
- Store proposals with BOTH `user_id` AND `project_id` (required)
- Update RAG retrieval to:
  - Filter by `user_id` (user's chunks)
  - Filter by selected `source_ids` (only chunks from selected files)
- When regenerating proposals: Delete all existing proposals for that `user_id` + `project_id` combination first

#### 2.5 Tree Building
File: `app/api/projects/[projectId]/proposals/route.ts`

Changes:
- Fetch proposals by `user_id` instead of `project_id`
- Still build tree into `project_id` (as requested)
- Update `buildTreeInBackground` to accept `userId` parameter

### Phase 3: Frontend Updates

#### 3.1 Import Page
File: `app/dashboard/projects/[projectId]/import/page.tsx`

Changes:
- Remove `projectId` from import API calls (files are user-scoped)
- Update `fetchData()` to fetch user-scoped sources (all user's files across all projects)
- Update proposal fetching to be user+project scoped (proposals for this specific project)
- Add file selection UI for proposal generation (user selects which files to use)
- Keep project context for proposal generation and tree building

#### 3.2 API Routes for Fetching Data
Files:
- `app/api/projects/[projectId]/sources/route.ts` → Change to user-scoped (GET all user's files, not project files)
- `app/api/projects/[projectId]/proposals/route.ts` → 
  - GET: Fetch proposals for `user_id` + `project_id` combination
  - POST (generate): Accept `selectedSourceIds[]` parameter, store proposals with `user_id` + `project_id`
  - POST (tree build): Stays project-scoped (uses proposals from that user+project)

Or create new routes:
- `app/api/user/sources/route.ts` (GET user's sources - all files across all projects)
- Keep `app/api/projects/[projectId]/proposals/route.ts` for project-specific proposals

#### 3.3 UI Updates
- Update "Manage Files" tab to show user's files (all files across all projects)
- Add file selection UI for proposal generation (checkboxes to select which files to use)
- Update "Review Proposals" tab to show user's proposals for THIS project only
- Keep "Build Tree" functionality project-scoped (select proposals from this project → build into project)
- File deletion: Show warning that deletion removes file from all projects

### Phase 4: RAG & Vector Search Updates

#### 4.1 RAG Retriever
File: `lib/ai/rag-retriever.ts`

Changes:
- Update `retrieveContextForSynthesis` to accept `userId` and `selectedSourceIds[]`
- Update `getPrimaryChunks` to filter by `user_id` AND `selectedSourceIds`
- Update vector search calls to use `user_id_filter` and `source_ids_filter` parameters
- Only retrieve chunks from files selected for proposal generation

#### 4.2 Embedding Storage
File: `lib/ai/embeddings.ts`

Changes:
- Update `storeEmbeddings` to use `userId` instead of `projectId`

### Phase 5: Testing & Validation

1. Test file upload (should store with user_id, no project_id)
2. Test file processing (chunks should have user_id)
3. Test proposal generation (proposals should have user_id)
4. Test tree building (should fetch user proposals, build into project)
5. Test RAG retrieval (should use user-scoped chunks)
6. Test vector search (should filter by user_id)

## Migration Strategy

### Data Migration
1. Run migrations in order (1, 2, 3, 4)
2. Verify all existing data has `user_id` set
3. Test with existing data before deploying

### Deployment Strategy
1. Deploy migrations first (backward compatible - project_id still exists)
2. Deploy API changes (can handle both old and new data)
3. Deploy frontend changes
4. Monitor for issues
5. Eventually remove `project_id` columns (future migration)

## Key Considerations

1. **Backward Compatibility**: Keep `project_id` nullable in `ingestion_sources` and `chunks` to support existing data
2. **Storage Migration**: Need to migrate files from `project-uploads/${projectId}/` to `user-uploads/${userId}/`
3. **RLS Policies**: Update Row Level Security policies to filter by `user_id` for files/chunks, `user_id` + `project_id` for proposals
4. **Performance**: Ensure indexes are updated for `user_id` queries and composite `user_id` + `project_id` for proposals
5. **Tree Building**: Must still work with project context (user selects proposals from that project → builds into project)
6. **File Selection**: Add UI for selecting which files to use for proposal generation
7. **Proposal Regeneration**: When regenerating, delete all existing proposals for that `user_id` + `project_id` first
8. **File Deletion**: Show clear warning that deletion affects all projects (since files are shared)

## Implementation Details

### File Selection for Proposal Generation
- User sees all their files (across all projects) in "Manage Files" tab
- When clicking "Generate Proposals", show file selection UI (checkboxes)
- User selects which files to use for generating proposals for THIS project
- Only chunks from selected files are used in RAG retrieval
- Proposals are stored with `user_id` + `project_id` (project-specific)

### Proposal Regeneration
- When user clicks "Regenerate Proposals" in a project:
  1. Delete all existing proposals for that `user_id` + `project_id`
  2. Use same selected files (or allow re-selection)
  3. Generate new proposals

### File Deletion
- Show confirmation dialog: "This will delete the file from all your projects. Continue?"
- Delete file from storage
- Delete source record (cascades to chunks)
- File disappears from all projects' import pages

