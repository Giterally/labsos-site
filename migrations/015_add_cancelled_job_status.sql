-- Add 'cancelled' to the jobs status constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check 
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- Add comment
COMMENT ON COLUMN public.jobs.status IS 'Job status: pending, running, completed, failed, or cancelled';
