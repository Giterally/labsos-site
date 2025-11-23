-- Migration 040: Fix RLS Policies for node_content, node_attachments, and node_links
-- Enable public project access for reading (matching tree_nodes pattern)
-- Write access remains restricted to project members only

-- Update node_content SELECT policy to allow public project access
DROP POLICY IF EXISTS "Users can view node content for accessible trees" ON node_content;

CREATE POLICY "Users can view node content for accessible trees"
  ON node_content FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN projects p ON et.project_id = p.id
      WHERE tn.id = node_content.node_id
      AND (
        p.visibility = 'public' OR
        p.created_by = auth.uid() OR
        is_project_member(p.id, auth.uid())
      )
    )
  );

-- Update node_links SELECT policy to allow public project access
DROP POLICY IF EXISTS "Users can view node links for accessible trees" ON node_links;

CREATE POLICY "Users can view node links for accessible trees"
  ON node_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN projects p ON et.project_id = p.id
      WHERE tn.id = node_links.node_id
      AND (
        p.visibility = 'public' OR
        p.created_by = auth.uid() OR
        is_project_member(p.id, auth.uid())
      )
    )
  );

-- Update node_attachments SELECT policy to allow public project access
DROP POLICY IF EXISTS "Users can view node attachments for accessible trees" ON node_attachments;

CREATE POLICY "Users can view node attachments for accessible trees"
  ON node_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tree_nodes tn
      JOIN experiment_trees et ON tn.tree_id = et.id
      JOIN projects p ON et.project_id = p.id
      WHERE tn.id = node_attachments.node_id
      AND (
        p.visibility = 'public' OR
        p.created_by = auth.uid() OR
        is_project_member(p.id, auth.uid())
      )
    )
  );

-- Add comments for documentation
COMMENT ON POLICY "Users can view node content for accessible trees" ON node_content IS 
  'Content inherits access from its tree/project (public or member access)';

COMMENT ON POLICY "Users can view node links for accessible trees" ON node_links IS 
  'Links inherit access from their tree/project (public or member access)';

COMMENT ON POLICY "Users can view node attachments for accessible trees" ON node_attachments IS 
  'Attachments inherit access from their tree/project (public or member access)';





