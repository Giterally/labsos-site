-- Add block_id to tree_nodes for workflow organization
ALTER TABLE public.tree_nodes
ADD COLUMN IF NOT EXISTS block_id UUID REFERENCES public.tree_blocks(id) ON DELETE SET NULL;

-- Add status field
ALTER TABLE public.tree_nodes
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final'));

-- Add created_by for tracking
ALTER TABLE public.tree_nodes
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create node_links table
CREATE TABLE IF NOT EXISTS public.node_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.tree_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  link_type TEXT CHECK (link_type IN ('documentation', 'paper', 'tool', 'other')) DEFAULT 'other',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_links_node_id ON public.node_links(node_id);

-- Create node_attachments table
CREATE TABLE IF NOT EXISTS public.node_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.tree_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  file_url TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_attachments_node_id ON public.node_attachments(node_id);

-- Enable RLS
ALTER TABLE public.node_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for node_links (same pattern as node_content)
CREATE POLICY "Users can view node links for accessible trees"
  ON public.node_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_links.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert node links for accessible trees"
  ON public.node_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_links.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update node links for accessible trees"
  ON public.node_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_links.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete node links for accessible trees"
  ON public.node_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_links.node_id
      AND pm.user_id = auth.uid()
    )
  );

-- RLS Policies for node_attachments (same pattern)
CREATE POLICY "Users can view node attachments for accessible trees"
  ON public.node_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_attachments.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert node attachments for accessible trees"
  ON public.node_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_attachments.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update node attachments for accessible trees"
  ON public.node_attachments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_attachments.node_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete node attachments for accessible trees"
  ON public.node_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_nodes tn
      JOIN public.experiment_trees et ON tn.tree_id = et.id
      JOIN public.projects p ON et.project_id = p.id
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE tn.id = node_attachments.node_id
      AND pm.user_id = auth.uid()
    )
  );
