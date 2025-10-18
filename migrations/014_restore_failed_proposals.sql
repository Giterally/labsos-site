-- Migration: Restore proposals that were marked as accepted but have no corresponding tree
-- This restores the 63 proposals from the failed tree build on 2025-10-18

-- Restore proposals that were marked as accepted but the tree build failed
UPDATE proposed_nodes
SET status = 'proposed', accepted_at = NULL
WHERE project_id = 'bbd66530-337c-4d26-9b72-bc20f334e397'
  AND status = 'accepted'
  AND accepted_at > '2025-10-18T16:00:00'::timestamp
  AND accepted_at < '2025-10-18T17:00:00'::timestamp;

-- Verify the restore
SELECT 
  project_id,
  status,
  COUNT(*) as proposal_count
FROM proposed_nodes
WHERE project_id = 'bbd66530-337c-4d26-9b72-bc20f334e397'
GROUP BY project_id, status;

