-- Migration 041: Fix RLS Policy for tree_blocks
-- Enable public project access for reading (matching tree_nodes pattern)
-- Write access remains restricted to project members only

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can access tree_blocks from their projects" ON tree_blocks;

-- Create SELECT policy that allows public project access
CREATE POLICY "tree_blocks_select" ON tree_blocks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_blocks.tree_id
    AND (
      p.visibility = 'public' OR
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Create INSERT policy (members only)
CREATE POLICY "tree_blocks_insert" ON tree_blocks FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_blocks.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Create UPDATE policy (members only)
CREATE POLICY "tree_blocks_update" ON tree_blocks FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_blocks.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Create DELETE policy (members only)
CREATE POLICY "tree_blocks_delete" ON tree_blocks FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM experiment_trees et
    JOIN projects p ON et.project_id = p.id
    WHERE et.id = tree_blocks.tree_id
    AND (
      p.created_by = auth.uid() OR
      is_project_member(p.id, auth.uid())
    )
  )
);

-- Add comment for documentation
COMMENT ON POLICY "tree_blocks_select" ON tree_blocks IS 
  'Blocks inherit access from their tree/project (public or member access)';





