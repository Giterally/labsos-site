-- Migration: Add template fields to experiment_trees for reusable protocols
-- This allows common protocols to be stored as templates

ALTER TABLE experiment_trees 
ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS template_category text;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_experiment_trees_is_template ON experiment_trees(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_experiment_trees_template_category ON experiment_trees(template_category) WHERE template_category IS NOT NULL;

-- Add comments
COMMENT ON COLUMN experiment_trees.is_template IS 'True if this tree is a reusable template (e.g., common protocols like RNA extraction)';
COMMENT ON COLUMN experiment_trees.template_category IS 'Category of the template (e.g., "RNA Extraction", "Western Blot", "PCR")';


