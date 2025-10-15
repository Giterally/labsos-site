-- Migration to unify custom_blocks and block_order into tree_blocks
-- This migration consolidates the two different block systems into one unified approach

-- First, ensure tree_blocks table has all necessary columns
-- (Assuming it already exists from AI-generated trees, but let's be safe)
CREATE TABLE IF NOT EXISTS tree_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid REFERENCES experiment_trees(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tree_blocks_tree_id_position ON tree_blocks(tree_id, position);

-- Migrate custom_blocks data to tree_blocks
INSERT INTO tree_blocks (id, tree_id, name, description, position, created_at, updated_at)
SELECT 
  id,
  tree_id,
  name,
  description,
  position,
  created_at,
  updated_at
FROM custom_blocks
WHERE NOT EXISTS (
  SELECT 1 FROM tree_blocks tb WHERE tb.id = custom_blocks.id
);

-- Update tree_nodes to use block_id instead of storing type as string
-- First, add block_id column if it doesn't exist
ALTER TABLE tree_nodes ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES tree_blocks(id) ON DELETE CASCADE;

-- Update tree_nodes that currently reference custom blocks by type
-- We need to map the node_type to the corresponding block_id
UPDATE tree_nodes 
SET block_id = (
  SELECT tb.id 
  FROM tree_blocks tb 
  WHERE tb.tree_id = tree_nodes.tree_id 
    AND tb.name ILIKE '%' || tree_nodes.node_type || '%'
  LIMIT 1
)
WHERE block_id IS NULL 
  AND node_type IS NOT NULL
  AND tree_id IN (SELECT tree_id FROM custom_blocks);

-- For nodes that couldn't be matched by name, create default blocks
-- This handles edge cases where node_type doesn't match block names
INSERT INTO tree_blocks (tree_id, name, description, position)
SELECT DISTINCT 
  tn.tree_id,
  tn.node_type || ' Block' as name,
  'Auto-created block for ' || tn.node_type || ' nodes' as description,
  COALESCE((
    SELECT MAX(position) + 1 
    FROM tree_blocks tb2 
    WHERE tb2.tree_id = tn.tree_id
  ), 0) as position
FROM tree_nodes tn
WHERE tn.block_id IS NULL 
  AND tn.node_type IS NOT NULL
  AND tn.tree_id IN (SELECT tree_id FROM custom_blocks)
ON CONFLICT DO NOTHING;

-- Now update the remaining nodes with the newly created blocks
UPDATE tree_nodes 
SET block_id = (
  SELECT tb.id 
  FROM tree_blocks tb 
  WHERE tb.tree_id = tree_nodes.tree_id 
    AND tb.name = tree_nodes.node_type || ' Block'
  LIMIT 1
)
WHERE block_id IS NULL 
  AND node_type IS NOT NULL
  AND tree_id IN (SELECT tree_id FROM custom_blocks);

-- Add constraint to ensure all tree_nodes have a block_id
ALTER TABLE tree_nodes ALTER COLUMN block_id SET NOT NULL;

-- Drop the old tables and columns
DROP TABLE IF EXISTS block_order CASCADE;
DROP TABLE IF EXISTS custom_blocks CASCADE;

-- Remove the node_type column since we now use block_id
-- (Keep it for now in case there are other references, but it's no longer used for block identification)
-- ALTER TABLE tree_nodes DROP COLUMN IF EXISTS node_type;

-- Add RLS policies for tree_blocks if they don't exist
ALTER TABLE tree_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access tree_blocks from their projects
CREATE POLICY IF NOT EXISTS "Users can access tree_blocks from their projects" ON tree_blocks
  FOR ALL USING (
    tree_id IN (
      SELECT et.id FROM experiment_trees et
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tree_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS tree_blocks_updated_at
  BEFORE UPDATE ON tree_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_tree_blocks_updated_at();
