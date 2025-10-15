-- Create jobs table for background job tracking
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'preprocess', 'chunk', 'embed', 'cluster', 'synthesize', 'validate'
  status text DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  payload jsonb DEFAULT '{}',
  result jsonb,
  error text,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- Create GIN index for payload queries
CREATE INDEX IF NOT EXISTS idx_jobs_payload ON jobs USING gin(payload);
