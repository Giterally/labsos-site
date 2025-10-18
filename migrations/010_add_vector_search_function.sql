-- Add vector search function for RAG retrieval

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(384),
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

-- Add comment
COMMENT ON FUNCTION match_chunks IS 'Performs vector similarity search on chunks using cosine distance';

