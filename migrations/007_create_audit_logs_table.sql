-- Create audit_logs table for tracking user actions and approvals
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL, -- 'upload', 'accept_node', 'reject_node', 'publish_tree', etc.
  resource_type text, -- 'node', 'tree', 'source', etc.
  resource_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create GIN index for payload queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_payload ON audit_logs USING gin(payload);
