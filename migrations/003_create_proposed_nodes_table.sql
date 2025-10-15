-- Create proposed_nodes table for AI-generated experiment tree nodes
CREATE TABLE IF NOT EXISTS proposed_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  node_json jsonb NOT NULL,
  status text DEFAULT 'proposed', -- 'proposed', 'accepted', 'rejected', 'merged'
  confidence numeric(3,2), -- 0.00 to 1.00
  provenance jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_project_id ON proposed_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_status ON proposed_nodes(status);
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_confidence ON proposed_nodes(confidence);
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_created_at ON proposed_nodes(created_at);

-- Create GIN index for node_json queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_node_json ON proposed_nodes USING gin(node_json);

-- Create GIN index for provenance queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_provenance ON proposed_nodes USING gin(provenance);
