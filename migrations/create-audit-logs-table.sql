-- Create audit_logs table for tracking all changes for provenance
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL, -- 'node_accepted', 'node_rejected', 'node_edited', 'tree_published', etc.
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resource_type text NOT NULL, -- 'node', 'tree', 'proposal', 'chunk'
  resource_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create index for user-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Create index for resource-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON public.audit_logs(project_id);

-- Create index for action queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access audit logs from their projects
CREATE POLICY "Users can access audit logs from their projects" ON public.audit_logs
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
