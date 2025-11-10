-- Add source_url column to ingestion_sources table for cloud storage file URLs
ALTER TABLE ingestion_sources 
ADD COLUMN IF NOT EXISTS source_url text;

-- Update source_type comment to include cloud storage providers
COMMENT ON COLUMN ingestion_sources.source_type IS 'Source type: pdf, excel, video, audio, text, markdown, github, googledrive, onedrive, dropbox, sharepoint';

-- Create index on source_url for efficient querying
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_source_url ON ingestion_sources(source_url) WHERE source_url IS NOT NULL;

