-- Create Postgres function for atomic progress updates with trigger for SSE notifications
-- This enables efficient progress updates and real-time notifications

-- Function to update job progress atomically
CREATE OR REPLACE FUNCTION update_job_progress(
  job_id UUID,
  stage TEXT,
  current_step INTEGER,
  total_steps INTEGER,
  message TEXT
) RETURNS TABLE(
  id UUID,
  progress_stage TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  progress_message TEXT,
  progress_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Update the job with new progress information
  UPDATE public.jobs 
  SET 
    progress_stage = stage,
    progress_current = current_step,
    progress_total = total_steps,
    progress_message = message,
    progress_updated_at = NOW(),
    updated_at = NOW()
  WHERE jobs.id = job_id;
  
  -- Return the updated progress information
  RETURN QUERY
  SELECT 
    j.id,
    j.progress_stage,
    j.progress_current,
    j.progress_total,
    j.progress_message,
    j.progress_updated_at
  FROM public.jobs j
  WHERE j.id = job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as complete
CREATE OR REPLACE FUNCTION complete_job_progress(
  job_id UUID,
  message TEXT DEFAULT 'Complete'
) RETURNS TABLE(
  id UUID,
  progress_stage TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  progress_message TEXT,
  progress_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Get current progress to set current = total
  DECLARE
    current_total INTEGER;
  BEGIN
    SELECT progress_total INTO current_total FROM public.jobs WHERE jobs.id = job_id;
    
    -- Update job as complete
    UPDATE public.jobs 
    SET 
      progress_stage = 'complete',
      progress_current = COALESCE(current_total, 100),
      progress_total = COALESCE(current_total, 100),
      progress_message = message,
      progress_updated_at = NOW(),
      updated_at = NOW(),
      status = CASE 
        WHEN status = 'cancelled' THEN 'cancelled'
        ELSE 'completed' 
      END,
      completed_at = NOW()
    WHERE jobs.id = job_id;
    
    -- Return the updated progress information
    RETURN QUERY
    SELECT 
      j.id,
      j.progress_stage,
      j.progress_current,
      j.progress_total,
      j.progress_message,
      j.progress_updated_at
    FROM public.jobs j
    WHERE j.id = job_id;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as error
CREATE OR REPLACE FUNCTION error_job_progress(
  job_id UUID,
  error_message TEXT
) RETURNS TABLE(
  id UUID,
  progress_stage TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  progress_message TEXT,
  progress_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Update job as error
  UPDATE public.jobs 
  SET 
    progress_stage = 'error',
    progress_current = 0,
    progress_total = 0,
    progress_message = error_message,
    progress_updated_at = NOW(),
    updated_at = NOW(),
    status = 'failed',
    error = error_message,
    completed_at = NOW()
  WHERE jobs.id = job_id;
  
  -- Return the updated progress information
  RETURN QUERY
  SELECT 
    j.id,
    j.progress_stage,
    j.progress_current,
    j.progress_total,
    j.progress_message,
    j.progress_updated_at
  FROM public.jobs j
  WHERE j.id = job_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION update_job_progress(UUID, TEXT, INTEGER, INTEGER, TEXT) IS 'Updates job progress atomically and returns updated progress data for SSE notifications';
COMMENT ON FUNCTION complete_job_progress(UUID, TEXT) IS 'Marks job as complete with final progress update';
COMMENT ON FUNCTION error_job_progress(UUID, TEXT) IS 'Marks job as failed with error message';
