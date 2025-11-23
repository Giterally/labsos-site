-- Migration: Create nested_tree_references table for tracking nested experiment trees
-- This allows nodes to reference reusable sub-procedures as separate trees

CREATE TABLE IF NOT EXISTS nested_tree_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_node_id uuid REFERENCES tree_nodes(id) ON DELETE CASCADE,
  nested_tree_id uuid REFERENCES experiment_trees(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(parent_node_id, nested_tree_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_nested_tree_references_parent_node_id ON nested_tree_references(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_nested_tree_references_nested_tree_id ON nested_tree_references(nested_tree_id);

-- Add RLS policies
ALTER TABLE nested_tree_references ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view nested tree references in their projects
CREATE POLICY "Users can view nested tree references in their projects" ON nested_tree_references
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE tn.id = nested_tree_references.parent_node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert nested tree references
CREATE POLICY "Service role can insert nested tree references" ON nested_tree_references
  FOR INSERT WITH CHECK (true);

-- Policy: Service role can update nested tree references
CREATE POLICY "Service role can update nested tree references" ON nested_tree_references
  FOR UPDATE USING (true);

-- Add comment
COMMENT ON TABLE nested_tree_references IS 'Tracks when a node references a nested/reusable experiment tree';
COMMENT ON COLUMN nested_tree_references.parent_node_id IS 'The node that references the nested tree';
COMMENT ON COLUMN nested_tree_references.nested_tree_id IS 'The nested/reusable experiment tree being referenced';







