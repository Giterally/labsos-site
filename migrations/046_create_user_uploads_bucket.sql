-- Migration 046: Create user-uploads storage bucket
-- Create storage bucket for user-scoped file uploads (shared across all user's projects)

-- Create storage bucket for user uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads',
  false,
  26214400, -- 25MB limit
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'text/markdown',
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/quicktime',
    'audio/mp3',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/x-aac'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for user uploads (INSERT)
-- Users can upload files to their own user folder
CREATE POLICY "Users can upload files to their user folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create storage policy for reading files (SELECT)
-- Users can read their own files
CREATE POLICY "Users can read their own files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create storage policy for deleting files (DELETE)
-- Users can delete their own files
CREATE POLICY "Users can delete their own files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create storage policy for updating files (UPDATE)
-- Users can update their own files
CREATE POLICY "Users can update their own files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

