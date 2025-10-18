-- Add progress tracking fields to jobs table
-- This enables real-time progress updates across browser tabs and sessions

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS progress_stage TEXT,
ADD COLUMN IF NOT EXISTS progress_current INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_message TEXT,
ADD COLUMN IF NOT EXISTS progress_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add index for efficient progress queries
CREATE INDEX IF NOT EXISTS idx_jobs_progress_updated_at ON public.jobs(progress_updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON public.jobs(project_id, status) WHERE status IN ('running', 'pending');

-- Add check constraint for valid progress stages
ALTER TABLE public.jobs 
ADD CONSTRAINT IF NOT EXISTS check_progress_stage 
CHECK (progress_stage IS NULL OR progress_stage IN (
  'initializing', 'clustering', 'synthesizing', 'deduplicating', 
  'building_blocks', 'building_nodes', 'complete', 'error'
));

-- Add check constraint for valid progress values
ALTER TABLE public.jobs 
ADD CONSTRAINT IF NOT EXISTS check_progress_values 
CHECK (
  progress_current >= 0 AND 
  progress_total >= 0 AND 
  progress_current <= progress_total
);

-- Add comment explaining the new fields
COMMENT ON COLUMN public.jobs.progress_stage IS 'Current stage of job execution for progress tracking';
COMMENT ON COLUMN public.jobs.progress_current IS 'Current step number (0-based)';
COMMENT ON COLUMN public.jobs.progress_total IS 'Total number of steps';
COMMENT ON COLUMN public.jobs.progress_message IS 'Human-readable status message';
COMMENT ON COLUMN public.jobs.progress_updated_at IS 'Timestamp of last progress update for SSE notifications';
