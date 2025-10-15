-- Create ingestion_sources table to track uploaded files/repos
CREATE TABLE IF NOT EXISTS public.ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'video', 'github', 'excel', 'text', 'markdown', 'audio')),
  source_name text NOT NULL,
  source_url text, -- For GitHub repos or external URLs
  storage_path text, -- Path in Supabase Storage
  file_size bigint,
  mime_type text,
  metadata jsonb DEFAULT '{}',
  status text DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_project_id ON public.ingestion_sources(project_id);

-- Create index for source type queries
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_source_type ON public.ingestion_sources(source_type);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_status ON public.ingestion_sources(status);

-- Create index for created_by queries
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_created_by ON public.ingestion_sources(created_by);

-- Enable RLS
ALTER TABLE public.ingestion_sources ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access ingestion sources from their projects
CREATE POLICY "Users can access ingestion sources from their projects" ON public.ingestion_sources
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
