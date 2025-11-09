-- Migration 042: Enable Row Level Security on tree_blocks and tree_nodes
-- These tables have RLS policies defined but RLS was not enabled
-- Enabling RLS will enforce the existing policies

-- Enable RLS on tree_blocks (has 4 policies: select, insert, update, delete)
ALTER TABLE tree_blocks ENABLE ROW LEVEL SECURITY;

-- Enable RLS on tree_nodes (has 4 policies: select, insert, update, delete)
ALTER TABLE tree_nodes ENABLE ROW LEVEL SECURITY;

-- Add comments for documentation
COMMENT ON TABLE tree_blocks IS 
  'RLS enabled: Access controlled by project visibility and membership';
COMMENT ON TABLE tree_nodes IS 
  'RLS enabled: Access controlled by project visibility and membership';

