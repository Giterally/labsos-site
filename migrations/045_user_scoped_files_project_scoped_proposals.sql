-- Migration 045: User-Scoped Files and Project-Scoped Proposals
-- Transform ingestion_sources and chunks to be user-scoped (shared across projects)
-- Keep proposed_nodes per-user, per-project (both user_id and project_id required)
-- Update structured_documents to be user-scoped

-- ============================================================================
-- 1. Update ingestion_sources table
-- ============================================================================

-- Make project_id nullable (files are user-scoped, not project-scoped)
ALTER TABLE ingestion_sources 
  ALTER COLUMN project_id DROP NOT NULL;

-- Add user_id column
ALTER TABLE ingestion_sources 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: set user_id from created_by
UPDATE ingestion_sources 
SET user_id = created_by 
WHERE user_id IS NULL;

-- Make user_id required after migration
ALTER TABLE ingestion_sources 
  ALTER COLUMN user_id SET NOT NULL;

-- Set project_id to NULL for all existing records (files are user-scoped)
UPDATE ingestion_sources SET project_id = NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_ingestion_sources_project_id;
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_user_id ON ingestion_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_project_id ON ingestion_sources(project_id) WHERE project_id IS NOT NULL;

-- ============================================================================
-- 2. Update chunks table
-- ============================================================================

-- Make project_id nullable (chunks are user-scoped, not project-scoped)
ALTER TABLE chunks 
  ALTER COLUMN project_id DROP NOT NULL;

-- Add user_id column
ALTER TABLE chunks 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: get user_id from ingestion_sources
UPDATE chunks c
SET user_id = s.user_id
FROM ingestion_sources s
WHERE (c.source_ref->>'sourceId')::uuid = s.id
  AND c.user_id IS NULL;

-- Set project_id to NULL for all chunks (chunks are user-scoped)
UPDATE chunks SET project_id = NULL;

-- Make user_id required after migration
ALTER TABLE chunks 
  ALTER COLUMN user_id SET NOT NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_chunks_project_id;
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON chunks((source_ref->>'sourceId')) WHERE source_ref->>'sourceId' IS NOT NULL;

-- ============================================================================
-- 3. Update proposed_nodes table
-- ============================================================================

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

-- ============================================================================
-- 4. Update structured_documents table
-- ============================================================================

-- Make project_id nullable (structured documents are user-scoped)
ALTER TABLE structured_documents 
  ALTER COLUMN project_id DROP NOT NULL;

-- Add user_id column
ALTER TABLE structured_documents 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Migrate existing data: get user_id from ingestion_sources
UPDATE structured_documents sd
SET user_id = s.user_id
FROM ingestion_sources s
WHERE sd.source_id = s.id
  AND sd.user_id IS NULL;

-- Set project_id to NULL for all structured documents
UPDATE structured_documents SET project_id = NULL;

-- Make user_id required after migration
ALTER TABLE structured_documents 
  ALTER COLUMN user_id SET NOT NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_structured_documents_project_id;
CREATE INDEX IF NOT EXISTS idx_structured_documents_user_id ON structured_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_structured_documents_project_id ON structured_documents(project_id) WHERE project_id IS NOT NULL;

-- ============================================================================
-- 5. Update match_chunks function
-- ============================================================================

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

-- Update comment
COMMENT ON FUNCTION match_chunks IS 'Performs vector similarity search on chunks using cosine distance, filtered by user_id and optionally by source_ids';

