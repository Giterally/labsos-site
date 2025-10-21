-- Create node_content table to store text content for tree nodes
CREATE TABLE IF NOT EXISTS public.node_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.tree_nodes(id) ON DELETE CASCADE,
  content TEXT,
  status TEXT CHECK (status IN ('draft', 'final')) DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(node_id, version)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_node_content_node_id ON public.node_content(node_id);

-- Add RLS policies for node_content
ALTER TABLE public.node_content ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view node content if they can view the tree
CREATE POLICY "Users can view node content for accessible trees"
  ON public.node_content FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_content.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert node content if they can edit the tree
CREATE POLICY "Users can insert node content for accessible trees"
  ON public.node_content FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_content.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can update node content if they can edit the tree
CREATE POLICY "Users can update node content for accessible trees"
  ON public.node_content FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_content.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete node content if they can edit the tree
CREATE POLICY "Users can delete node content for accessible trees"
  ON public.node_content FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_content.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON TABLE public.node_content IS 'Stores text content for experiment tree nodes with version control';
