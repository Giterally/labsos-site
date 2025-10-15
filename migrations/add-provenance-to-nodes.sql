-- Add provenance and confidence columns to existing tree_nodes table
ALTER TABLE public.tree_nodes 
ADD COLUMN IF NOT EXISTS provenance jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS confidence numeric(3,2) DEFAULT 1.0;

-- Create index for confidence queries
CREATE INDEX IF NOT EXISTS idx_tree_nodes_confidence ON public.tree_nodes(confidence);

-- Create index for provenance queries (GIN index for jsonb)
CREATE INDEX IF NOT EXISTS idx_tree_nodes_provenance ON public.tree_nodes USING gin(provenance);
