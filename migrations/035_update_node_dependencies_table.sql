-- Migration: Update node_dependencies table to match new schema
-- Adds from_node_id and to_node_id columns (keeping existing node_id for backwards compatibility)
-- Adds evidence_text column for storing extracted phrases

-- Add new columns if they don't exist
ALTER TABLE node_dependencies 
ADD COLUMN IF NOT EXISTS from_node_id uuid REFERENCES tree_nodes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS to_node_id uuid REFERENCES tree_nodes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS evidence_text text;

-- Migrate existing data if node_id and depends_on_node_id exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'node_dependencies' 
    AND column_name = 'node_id'
  ) THEN
    UPDATE node_dependencies
    SET from_node_id = node_id,
        to_node_id = depends_on_node_id
    WHERE from_node_id IS NULL;
  END IF;
END $$;

-- Update unique constraint to use new column names
ALTER TABLE node_dependencies 
DROP CONSTRAINT IF EXISTS node_dependencies_node_id_depends_on_node_id_key;

-- Keep old constraint for backwards compatibility, but add new one
ALTER TABLE node_dependencies 
ADD CONSTRAINT node_dependencies_from_to_unique UNIQUE(from_node_id, to_node_id, dependency_type);

-- Update indexes
CREATE INDEX IF NOT EXISTS idx_node_dependencies_from_node_id ON node_dependencies(from_node_id);
CREATE INDEX IF NOT EXISTS idx_node_dependencies_to_node_id ON node_dependencies(to_node_id);

-- Add comment
COMMENT ON COLUMN node_dependencies.from_node_id IS 'The node that depends on another node';
COMMENT ON COLUMN node_dependencies.to_node_id IS 'The node that is depended upon';
COMMENT ON COLUMN node_dependencies.evidence_text IS 'Original phrase from source document showing the dependency';




