-- Create node_embeddings table for AI-powered semantic search
-- This table stores vector embeddings for experiment tree nodes

CREATE TABLE IF NOT EXISTS node_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id UUID REFERENCES tree_nodes(id) ON DELETE CASCADE UNIQUE NOT NULL,
  content_hash TEXT NOT NULL, -- SHA-256 hash to detect content changes
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB DEFAULT '{}', -- Store token count, model version, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast similarity search using cosine distance
-- IVFFlat index is optimized for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS node_embeddings_embedding_idx ON node_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for quick lookups by node_id
CREATE INDEX IF NOT EXISTS node_embeddings_node_id_idx ON node_embeddings(node_id);

-- Index for content change detection
CREATE INDEX IF NOT EXISTS node_embeddings_content_hash_idx ON node_embeddings(content_hash);

-- Queue for failed embeddings that need retry
CREATE TABLE IF NOT EXISTS embedding_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id UUID REFERENCES tree_nodes(id) ON DELETE CASCADE NOT NULL,
  retry_count INT DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for queue processing (only items that will be retried)
CREATE INDEX IF NOT EXISTS embedding_queue_retry_idx ON embedding_queue(next_retry_at)
WHERE retry_count < 5;

-- Create vector search function for node embeddings
CREATE OR REPLACE FUNCTION search_nodes_by_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  tree_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  node_id uuid,
  node_name text,
  node_description text,
  block_id uuid,
  block_name text,
  similarity float,
  content_preview text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tn.id as node_id,
    tn.name as node_name,
    tn.description as node_description,
    tb.id as block_id,
    tb.name as block_name,
    (1 - (ne.embedding <=> query_embedding)) as similarity,
    LEFT(nc.content, 200) as content_preview
  FROM node_embeddings ne
  JOIN tree_nodes tn ON ne.node_id = tn.id
  LEFT JOIN tree_blocks tb ON tn.block_id = tb.id
  LEFT JOIN node_content nc ON tn.id = nc.node_id
  WHERE 
    ne.embedding IS NOT NULL
    AND (tree_id_filter IS NULL OR tn.tree_id = tree_id_filter)
    AND (1 - (ne.embedding <=> query_embedding)) > match_threshold
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION search_nodes_by_embedding IS 'Performs vector similarity search on node embeddings using cosine distance';

-- Enable RLS on node_embeddings
ALTER TABLE node_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access embeddings for nodes in their accessible trees
CREATE POLICY "Users can view embeddings for accessible nodes"
  ON node_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      WHERE tn.id = node_embeddings.node_id
        AND (
          -- User is a project member
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = et.project_id
              AND pm.user_id = auth.uid()
          )
          OR
          -- Project is public (using visibility column)
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = et.project_id
              AND p.visibility = 'public'
          )
        )
    )
  );

-- Policy: Service role can manage embeddings (for backend operations)
CREATE POLICY "Service role can manage embeddings"
  ON node_embeddings
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Enable RLS on embedding_queue
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage queue
CREATE POLICY "Service role can manage embedding queue"
  ON embedding_queue
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Add updated_at trigger for node_embeddings
CREATE OR REPLACE FUNCTION update_node_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER node_embeddings_updated_at
  BEFORE UPDATE ON node_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_node_embeddings_updated_at();

