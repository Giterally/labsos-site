-- Migration: Add referenced_tree_id to tree_nodes for nested experiment trees
-- This allows nodes to reference other experiment trees, creating a nesting hierarchy

-- Add the referenced_tree_id column
ALTER TABLE tree_nodes 
ADD COLUMN referenced_tree_id UUID REFERENCES experiment_trees(id) ON DELETE SET NULL;

-- Add index for performance on referenced tree lookups
CREATE INDEX idx_tree_nodes_referenced_tree_id ON tree_nodes(referenced_tree_id);

-- Add partial index for non-null values to optimize parent lookup queries
CREATE INDEX idx_tree_nodes_referenced_tree_id_not_null ON tree_nodes(referenced_tree_id) WHERE referenced_tree_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN tree_nodes.referenced_tree_id IS 'References another experiment tree, allowing trees to be nested within each other. Only trees from the same project can be referenced.';

