-- Create jobs table for background job tracking
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'preprocess', 'chunk', 'embed', 'cluster', 'synthesize', 'validate'
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}',
  error text,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for type queries
CREATE INDEX IF NOT EXISTS idx_jobs_type ON public.jobs(type);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON public.jobs(project_id);

-- Create index for created_by queries
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access jobs from their projects
CREATE POLICY "Users can access jobs from their projects" ON public.jobs
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
