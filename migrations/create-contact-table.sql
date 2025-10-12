-- Create contact table for contact form submissions
CREATE TABLE IF NOT EXISTS public.contact (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.contact ENABLE ROW LEVEL SECURITY;

-- Create policies for contact table
-- Allow anyone to insert contact form submissions (no auth required)
CREATE POLICY "Anyone can submit contact form" ON public.contact
  FOR INSERT WITH CHECK (true);

-- Only allow authenticated users to view contact submissions
-- (You can modify this policy based on your admin access needs)
CREATE POLICY "Authenticated users can view contact submissions" ON public.contact
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_contact_created_at ON public.contact(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_email ON public.contact(email);

