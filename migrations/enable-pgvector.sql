-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create chunks table for semantic text chunks with embeddings
CREATE TABLE IF NOT EXISTS public.chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- 'pdf','video','github','excel','slack','text'
  source_ref jsonb,          -- e.g. { "file":"s3://..","path":"scripts/align.py","timestamp":"..." }
  text text NOT NULL,
  embedding vector(1536),    -- OpenAI text-embedding-3-small dimension
  metadata jsonb DEFAULT '{}',
  content_hash text,         -- For deduplication
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON public.chunks(project_id);

-- Create index for source type queries
CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON public.chunks(source_type);

-- Create index for content hash (deduplication)
CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON public.chunks(content_hash);

-- Enable RLS
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access chunks from their projects
CREATE POLICY "Users can access chunks from their projects" ON public.chunks
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
