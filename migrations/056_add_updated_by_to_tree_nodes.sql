-- Migration: Add updated_by column to tree_nodes table
-- This tracks who last edited each node

-- Add updated_by column
ALTER TABLE public.tree_nodes 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add foreign key constraint (explicitly named for Supabase PostgREST)
-- Drop first if it exists (idempotent)
ALTER TABLE public.tree_nodes
DROP CONSTRAINT IF EXISTS tree_nodes_updated_by_fkey;

ALTER TABLE public.tree_nodes
ADD CONSTRAINT tree_nodes_updated_by_fkey 
FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_tree_nodes_updated_by ON public.tree_nodes(updated_by) WHERE updated_by IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.tree_nodes.updated_by IS 'User who last updated this node. NULL for nodes created before this migration.';

