-- Fix missing 'software' in CHECK constraint
-- This migration adds 'software' to the allowed node_type values
-- to match the Zod schema and prevent insertion failures

ALTER TABLE tree_nodes 
  DROP CONSTRAINT IF EXISTS tree_nodes_node_type_check;

ALTER TABLE tree_nodes 
  ADD CONSTRAINT tree_nodes_node_type_check 
  CHECK (node_type IN ('protocol', 'data_creation', 'analysis', 'results', 'software'));

