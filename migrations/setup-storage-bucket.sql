-- Create storage bucket for project uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-uploads',
  'project-uploads',
  false,
  104857600, -- 100MB limit
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
    'audio/mpeg'
  ]
);

-- Create storage policy for project uploads
CREATE POLICY "Users can upload files to their project folders" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Create storage policy for reading files
CREATE POLICY "Users can read files from their project folders" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Create storage policy for deleting files
CREATE POLICY "Users can delete files from their project folders" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'project-uploads' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM public.projects p
      JOIN public.project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );
