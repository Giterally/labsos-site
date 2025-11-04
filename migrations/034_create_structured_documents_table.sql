-- Migration: Create structured_documents table for storing parsed documents with preserved hierarchy
-- This replaces the chunks table approach for the new fast import pipeline

CREATE TABLE IF NOT EXISTS structured_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  document_json jsonb NOT NULL, -- StructuredDocument object
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_structured_documents_source_id ON structured_documents(source_id);
CREATE INDEX IF NOT EXISTS idx_structured_documents_project_id ON structured_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_structured_documents_created_at ON structured_documents(created_at);

-- Create GIN index for document_json queries
CREATE INDEX IF NOT EXISTS idx_structured_documents_document_json ON structured_documents USING gin(document_json);

-- Add RLS policies
ALTER TABLE structured_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view structured documents in their projects
CREATE POLICY "Users can view structured documents in their projects" ON structured_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = structured_documents.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert structured documents
CREATE POLICY "Service role can insert structured documents" ON structured_documents
  FOR INSERT WITH CHECK (true); -- Service role bypasses RLS

-- Policy: Service role can update structured documents
CREATE POLICY "Service role can update structured documents" ON structured_documents
  FOR UPDATE USING (true); -- Service role bypasses RLS

-- Add comment
COMMENT ON TABLE structured_documents IS 'Stores parsed documents with preserved hierarchical structure (sections, headings, lists) for the fast import pipeline';
COMMENT ON COLUMN structured_documents.document_json IS 'JSONB containing StructuredDocument with sections, content blocks, and metadata';

