-- Create tree_versions table for version snapshots of experiment trees
CREATE TABLE IF NOT EXISTS public.tree_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid REFERENCES public.experiment_trees(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL, -- Full tree structure as JSON
  change_summary text,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create unique constraint for tree_id + version_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_versions_tree_version 
ON public.tree_versions(tree_id, version_number);

-- Create index for tree-based queries
CREATE INDEX IF NOT EXISTS idx_tree_versions_tree_id ON public.tree_versions(tree_id);

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_tree_versions_version_number ON public.tree_versions(version_number);

-- Create index for published_at queries
CREATE INDEX IF NOT EXISTS idx_tree_versions_published_at ON public.tree_versions(published_at);

-- Enable RLS
ALTER TABLE public.tree_versions ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access tree versions from their projects
CREATE POLICY "Users can access tree versions from their projects" ON public.tree_versions
  FOR ALL USING (
    tree_id IN (
      SELECT et.id FROM public.experiment_trees et
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
