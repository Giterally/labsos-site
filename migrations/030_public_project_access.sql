-- Migration 030: Update Public Project Access
-- Enable unauthenticated users to view public projects

-- Update projects policy to allow public access
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_select" ON projects FOR SELECT USING (
  -- Public projects visible to all
  visibility = 'public' OR
  -- Private projects visible to owner
  created_by = auth.uid() OR
  -- Private projects visible to members
  is_project_member(id, auth.uid())
);

CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (
  -- Only authenticated users can create projects
  auth.uid() IS NOT NULL AND
  created_by = auth.uid()
);

CREATE POLICY "projects_update" ON projects FOR UPDATE USING (
  -- Only project owner can update
  created_by = auth.uid()
);

CREATE POLICY "projects_delete" ON projects FOR DELETE USING (
  -- Only project owner can delete
  created_by = auth.uid()
);

-- Update experiment_trees to inherit public access
DROP POLICY IF EXISTS "Members can view experiment trees" ON experiment_trees;
DROP POLICY IF EXISTS "Members can create experiment trees" ON experiment_trees;
DROP POLICY IF EXISTS "Members can update experiment trees" ON experiment_trees;
DROP POLICY IF EXISTS "Members can delete experiment trees" ON experiment_trees;

CREATE POLICY "experiment_trees_select" ON experiment_trees FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = experiment_trees.project_id
    AND (
      p.visibility = 'public' OR
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "experiment_trees_insert" ON experiment_trees FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = experiment_trees.project_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "experiment_trees_update" ON experiment_trees FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = experiment_trees.project_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "experiment_trees_delete" ON experiment_trees FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = experiment_trees.project_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Update tree_nodes to inherit public access
DROP POLICY IF EXISTS "Users can view tree nodes of projects they're in" ON tree_nodes;
DROP POLICY IF EXISTS "Users can manage tree nodes in their projects" ON tree_nodes;

CREATE POLICY "tree_nodes_select" ON tree_nodes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_nodes.tree_id
    AND (
      p.visibility = 'public' OR
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "tree_nodes_insert" ON tree_nodes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_nodes.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "tree_nodes_update" ON tree_nodes FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_nodes.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

CREATE POLICY "tree_nodes_delete" ON tree_nodes FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_nodes.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Add comments for documentation
COMMENT ON POLICY "projects_select" ON projects IS 'Public projects visible to all, private projects to owner and members';
COMMENT ON POLICY "experiment_trees_select" ON experiment_trees IS 'Trees inherit access from their project (public or member access)';
COMMENT ON POLICY "tree_nodes_select" ON tree_nodes IS 'Nodes inherit access from their tree/project (public or member access)';
