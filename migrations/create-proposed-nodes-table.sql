-- Create proposed_nodes table for AI-generated node proposals
CREATE TABLE IF NOT EXISTS public.proposed_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  tree_id uuid REFERENCES public.experiment_trees(id) ON DELETE CASCADE,
  node_json jsonb NOT NULL,
  confidence numeric(3,2) DEFAULT 0.0,
  status text DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'merged')),
  provenance jsonb DEFAULT '{}',
  needs_review boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_project_id ON public.proposed_nodes(project_id);

-- Create index for tree-based queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_tree_id ON public.proposed_nodes(tree_id);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_status ON public.proposed_nodes(status);

-- Create index for confidence queries
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_confidence ON public.proposed_nodes(confidence);

-- Create index for review flag
CREATE INDEX IF NOT EXISTS idx_proposed_nodes_needs_review ON public.proposed_nodes(needs_review);

-- Enable RLS
ALTER TABLE public.proposed_nodes ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access proposed nodes from their projects
CREATE POLICY "Users can access proposed nodes from their projects" ON public.proposed_nodes
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
