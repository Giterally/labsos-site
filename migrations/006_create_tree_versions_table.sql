-- Create tree_versions table for experiment tree versioning
CREATE TABLE IF NOT EXISTS tree_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid REFERENCES experiment_trees(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text,
  description text,
  blocks jsonb DEFAULT '[]', -- Array of block objects
  nodes jsonb DEFAULT '[]',  -- Array of node objects
  change_summary text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  published_at timestamptz,
  is_published boolean DEFAULT false
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tree_versions_tree_id ON tree_versions(tree_id);
CREATE INDEX IF NOT EXISTS idx_tree_versions_version_number ON tree_versions(tree_id, version_number);
CREATE INDEX IF NOT EXISTS idx_tree_versions_published_at ON tree_versions(published_at);
CREATE INDEX IF NOT EXISTS idx_tree_versions_is_published ON tree_versions(is_published);

-- Create GIN index for blocks and nodes queries
CREATE INDEX IF NOT EXISTS idx_tree_versions_blocks ON tree_versions USING gin(blocks);
CREATE INDEX IF NOT EXISTS idx_tree_versions_nodes ON tree_versions USING gin(nodes);
