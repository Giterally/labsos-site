-- Migration to add node dependencies table for tracking relationships between nodes
-- This enables graph-based dependencies where nodes can reference prerequisites from any block

-- Create node_dependencies table
CREATE TABLE IF NOT EXISTS node_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid REFERENCES tree_nodes(id) ON DELETE CASCADE,
  depends_on_node_id uuid REFERENCES tree_nodes(id) ON DELETE CASCADE,
  dependency_type text CHECK (dependency_type IN ('requires', 'uses_output', 'follows', 'validates')) NOT NULL,
  confidence decimal(3,2) DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(node_id, depends_on_node_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_node_dependencies_node_id ON node_dependencies(node_id);
CREATE INDEX IF NOT EXISTS idx_node_dependencies_depends_on ON node_dependencies(depends_on_node_id);
CREATE INDEX IF NOT EXISTS idx_node_dependencies_type ON node_dependencies(dependency_type);

-- Add RLS policies
ALTER TABLE node_dependencies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view dependencies for nodes in their projects
CREATE POLICY "Users can view node dependencies in their projects" ON node_dependencies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE tn.id = node_dependencies.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert dependencies for nodes in their projects
CREATE POLICY "Users can insert node dependencies in their projects" ON node_dependencies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE tn.id = node_dependencies.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can update dependencies for nodes in their projects
CREATE POLICY "Users can update node dependencies in their projects" ON node_dependencies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE tn.id = node_dependencies.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete dependencies for nodes in their projects
CREATE POLICY "Users can delete node dependencies in their projects" ON node_dependencies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN project_members pm ON et.project_id = pm.project_id
      WHERE tn.id = node_dependencies.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_node_dependencies_updated_at 
  BEFORE UPDATE ON node_dependencies 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment explaining the table
COMMENT ON TABLE node_dependencies IS 'Tracks dependencies between experiment tree nodes, enabling graph-based workflow representation';
COMMENT ON COLUMN node_dependencies.dependency_type IS 'Type of dependency: requires (prerequisite), uses_output (data dependency), follows (sequential), validates (verification)';
COMMENT ON COLUMN node_dependencies.confidence IS 'Confidence score (0-1) for the dependency relationship, based on AI analysis';
