-- Migration: Add nested tree marker fields to tree_nodes
-- This allows nodes to be marked as references to nested trees

ALTER TABLE tree_nodes 
ADD COLUMN IF NOT EXISTS is_nested_tree_ref boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS nested_tree_id uuid REFERENCES experiment_trees(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tree_nodes_is_nested_tree_ref ON tree_nodes(is_nested_tree_ref) WHERE is_nested_tree_ref = true;
CREATE INDEX IF NOT EXISTS idx_tree_nodes_nested_tree_id ON tree_nodes(nested_tree_id) WHERE nested_tree_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN tree_nodes.is_nested_tree_ref IS 'True if this node is a reference to a nested/reusable tree rather than containing full content';
COMMENT ON COLUMN tree_nodes.nested_tree_id IS 'The ID of the nested tree this node references (if is_nested_tree_ref is true)';




