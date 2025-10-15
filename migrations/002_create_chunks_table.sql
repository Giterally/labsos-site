-- Create chunks table for semantic chunks from ingestion
CREATE TABLE IF NOT EXISTS chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- 'pdf','video','github','excel','slack','text'
  source_ref jsonb,          -- e.g. { "file":"s3://..","path":"scripts/align.py","timestamp":"..." }
  text text NOT NULL,
  embedding vector(1536),    -- OpenAI text-embedding-3-small dimension
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at);

-- Create vector similarity index for embeddings
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine 
ON chunks USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING gin(metadata);
