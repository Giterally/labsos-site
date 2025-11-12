# Migration 045: User-Scoped Files and Project-Scoped Proposals - Schema Tracking

This document tracks the exact schema changes made in migration 045.

## ingestion_sources Table

### BEFORE
```sql
CREATE TABLE ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,  -- REQUIRED
  source_type text NOT NULL,
  source_name text NOT NULL,
  storage_path text,
  file_size bigint,
  mime_type text,
  status text DEFAULT 'uploaded',
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ingestion_sources_project_id ON ingestion_sources(project_id);
```

### AFTER
```sql
CREATE TABLE ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,  -- NULLABLE (files are user-scoped)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- NEW: REQUIRED
  source_type text NOT NULL,
  source_name text NOT NULL,
  storage_path text,
  file_size bigint,
  mime_type text,
  status text DEFAULT 'uploaded',
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ingestion_sources_user_id ON ingestion_sources(user_id);
CREATE INDEX idx_ingestion_sources_project_id ON ingestion_sources(project_id) WHERE project_id IS NOT NULL;
```

### Changes
- `project_id`: Changed from `NOT NULL` to nullable
- `user_id`: Added as `NOT NULL` column
- Index: Replaced `idx_ingestion_sources_project_id` with user_id index and partial project_id index

---

## chunks Table

### BEFORE
```sql
CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,  -- REQUIRED
  source_type text NOT NULL,
  source_ref jsonb,
  text text NOT NULL,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chunks_project_id ON chunks(project_id);
```

### AFTER
```sql
CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,  -- NULLABLE (chunks are user-scoped)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- NEW: REQUIRED
  source_type text NOT NULL,
  source_ref jsonb,
  text text NOT NULL,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chunks_user_id ON chunks(user_id);
CREATE INDEX idx_chunks_source_id ON chunks((source_ref->>'sourceId')) WHERE source_ref->>'sourceId' IS NOT NULL;
```

### Changes
- `project_id`: Changed from `NOT NULL` to nullable
- `user_id`: Added as `NOT NULL` column
- Index: Replaced `idx_chunks_project_id` with user_id index and source_id index

---

## proposed_nodes Table

### BEFORE
```sql
CREATE TABLE proposed_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,  -- REQUIRED
  node_json jsonb NOT NULL,
  status text DEFAULT 'proposed',
  confidence numeric(3,2),
  provenance jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text
);

CREATE INDEX idx_proposed_nodes_project_id ON proposed_nodes(project_id);
```

### AFTER
```sql
CREATE TABLE proposed_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,  -- STILL REQUIRED (per-user, per-project)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- NEW: REQUIRED
  node_json jsonb NOT NULL,
  status text DEFAULT 'proposed',
  confidence numeric(3,2),
  provenance jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text
);

CREATE INDEX idx_proposed_nodes_project_id ON proposed_nodes(project_id);  -- KEPT
CREATE INDEX idx_proposed_nodes_user_id ON proposed_nodes(user_id);  -- NEW
CREATE INDEX idx_proposed_nodes_user_project ON proposed_nodes(user_id, project_id);  -- NEW: Composite index
```

### Changes
- `project_id`: Remains `NOT NULL` (proposals are per-user, per-project)
- `user_id`: Added as `NOT NULL` column
- Indexes: Added user_id index and composite user_id+project_id index

---

## structured_documents Table

### BEFORE
```sql
CREATE TABLE structured_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES ingestion_sources(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,  -- REQUIRED
  document_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_structured_documents_project_id ON structured_documents(project_id);
```

### AFTER
```sql
CREATE TABLE structured_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES ingestion_sources(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,  -- NULLABLE (user-scoped)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- NEW: REQUIRED
  document_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_structured_documents_user_id ON structured_documents(user_id);
CREATE INDEX idx_structured_documents_project_id ON structured_documents(project_id) WHERE project_id IS NOT NULL;
```

### Changes
- `project_id`: Changed from `NOT NULL` to nullable
- `user_id`: Added as `NOT NULL` column
- Index: Replaced with user_id index and partial project_id index

---

## match_chunks Function

### BEFORE
```sql
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(384),  -- NOTE: Original uses 384, but chunks table has 1536
  match_threshold float,
  match_count int,
  project_id_filter uuid
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
  WHERE c.project_id = project_id_filter
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### AFTER
```sql
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),  -- UPDATED: Matches chunks table dimension
  match_threshold float,
  match_count int,
  user_id_filter uuid,  -- CHANGED: From project_id_filter to user_id_filter
  source_ids_filter uuid[] DEFAULT NULL  -- NEW: Optional filter by source IDs
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
  WHERE c.user_id = user_id_filter  -- CHANGED: Filter by user_id instead of project_id
    AND c.embedding IS NOT NULL
    AND (source_ids_filter IS NULL OR (c.source_ref->>'sourceId')::uuid = ANY(source_ids_filter))  -- NEW: Optional source filter
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### Changes
- Parameter: Changed from `project_id_filter uuid` to `user_id_filter uuid`
- Parameter: Added `source_ids_filter uuid[] DEFAULT NULL` for filtering by selected source IDs
- Embedding dimension: Updated from 384 to 1536 (to match chunks table)
- WHERE clause: Changed from `c.project_id = project_id_filter` to `c.user_id = user_id_filter`
- WHERE clause: Added optional filter `(source_ids_filter IS NULL OR (c.source_ref->>'sourceId')::uuid = ANY(source_ids_filter))`

---

## Summary of Changes

### Tables Modified
1. **ingestion_sources**: `project_id` nullable, `user_id` required
2. **chunks**: `project_id` nullable, `user_id` required
3. **proposed_nodes**: `user_id` required (project_id remains required)
4. **structured_documents**: `project_id` nullable, `user_id` required

### Function Modified
1. **match_chunks**: Updated to use `user_id` instead of `project_id`, added optional `source_ids` filter

### Indexes Changed
- All `project_id` indexes replaced or made partial
- New `user_id` indexes added
- New composite `user_id + project_id` index for proposals
- New `source_id` index for chunks

### Data Migration
- All existing `ingestion_sources` records: `user_id` set from `created_by`, `project_id` set to NULL
- All existing `chunks` records: `user_id` set from related `ingestion_sources.user_id`, `project_id` set to NULL
- All existing `proposed_nodes` records: `user_id` set from `created_by`
- All existing `structured_documents` records: `user_id` set from related `ingestion_sources.user_id`, `project_id` set to NULL

