-- Migration 047: Rename file_size to version in node_attachments table
-- This changes the file_size field to version to track attachment versions

ALTER TABLE public.node_attachments
RENAME COLUMN file_size TO version;

-- Update the column type to TEXT to allow version strings (e.g., "1.0", "v2.1", etc.)
ALTER TABLE public.node_attachments
ALTER COLUMN version TYPE TEXT;

COMMENT ON COLUMN public.node_attachments.version IS 'Version identifier for the attachment (e.g., "1.0", "v2.1", "latest")';

