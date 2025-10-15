-- Create ingestion_sources table for tracking uploaded files and sources
CREATE TABLE IF NOT EXISTS ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- 'pdf', 'excel', 'video', 'audio', 'text', 'markdown', 'github'
  source_name text NOT NULL,
  storage_path text,
  file_size bigint,
  mime_type text,
  status text DEFAULT 'uploaded', -- 'uploaded', 'processing', 'completed', 'failed'
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_project_id ON ingestion_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_source_type ON ingestion_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_status ON ingestion_sources(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_created_at ON ingestion_sources(created_at);

-- Create GIN index for metadata queries
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_metadata ON ingestion_sources USING gin(metadata);
