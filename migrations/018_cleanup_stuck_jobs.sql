-- Clean up stuck/errored tree building jobs older than 1 hour
-- Run this migration to fix existing stuck jobs

UPDATE jobs
SET status = 'cancelled',
    progress_stage = 'cancelled',
    progress_message = 'Cleaned up stuck job',
    updated_at = NOW()
WHERE type = 'tree_build'
  AND status IN ('pending', 'running', 'error')
  AND updated_at < NOW() - INTERVAL '1 hour';

-- Log how many were cleaned up
DO $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % stuck tree building jobs', cleanup_count;
END $$;
