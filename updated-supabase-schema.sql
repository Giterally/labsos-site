-- Updated LabsOS Database Schema
-- Run this in your Supabase SQL Editor to replace the existing schema

-- Drop existing tables if they exist (be careful in production!)
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.experiment_trees CASCADE;
DROP TABLE IF EXISTS public.tree_nodes CASCADE;
DROP TABLE IF EXISTS public.software CASCADE;
DROP TABLE IF EXISTS public.project_software CASCADE;
DROP TABLE IF EXISTS public.datasets CASCADE;
DROP TABLE IF EXISTS public.project_datasets CASCADE;
DROP TABLE IF EXISTS public.outputs CASCADE;
DROP TABLE IF EXISTS public.project_outputs CASCADE;
DROP TABLE IF EXISTS public.past_members CASCADE;
DROP TABLE IF EXISTS public.related_projects CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  lab_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  institution TEXT,
  department TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project members table (many-to-many)
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  initials TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(project_id, user_id)
);

-- Create past members table
CREATE TABLE IF NOT EXISTS public.past_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  initials TEXT,
  duration TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create related projects table
CREATE TABLE IF NOT EXISTS public.related_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  related_project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  similarity_score INTEGER,
  similarity_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create experiment trees table
CREATE TABLE IF NOT EXISTS public.experiment_trees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  category TEXT DEFAULT 'protocol' CHECK (category IN ('protocol', 'analysis', 'data_collection', 'results')),
  node_count INTEGER DEFAULT 0,
  node_types JSONB DEFAULT '{"protocol": 0, "data_creation": 0, "analysis": 0, "results": 0}',
  linked_datasets TEXT[] DEFAULT '{}',
  linked_software TEXT[] DEFAULT '{}',
  linked_outputs TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tree nodes table
CREATE TABLE IF NOT EXISTS public.tree_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tree_id UUID REFERENCES public.experiment_trees(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tree_nodes(id),
  name TEXT NOT NULL,
  description TEXT,
  node_type TEXT CHECK (node_type IN ('protocol', 'data_creation', 'analysis', 'results')),
  position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create software table
CREATE TABLE IF NOT EXISTS public.software (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('internal', 'external')),
  category TEXT CHECK (category IN ('analysis', 'visualization', 'data_processing', 'simulation', 'other')),
  description TEXT,
  version TEXT,
  license_type TEXT CHECK (license_type IN ('free', 'paid', 'academic', 'commercial')),
  license_cost DECIMAL,
  license_period TEXT CHECK (license_period IN ('monthly', 'yearly', 'one_time')),
  repository_url TEXT,
  documentation_url TEXT,
  used_by TEXT[] DEFAULT '{}',
  linked_datasets TEXT[] DEFAULT '{}',
  linked_outputs TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project software junction table
CREATE TABLE IF NOT EXISTS public.project_software (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  software_id UUID REFERENCES public.software(id) ON DELETE CASCADE,
  UNIQUE(project_id, software_id)
);

-- Create datasets table
CREATE TABLE IF NOT EXISTS public.datasets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('raw_data', 'processed_data', 'training_data', 'validation_data')),
  description TEXT,
  format TEXT,
  file_size BIGINT,
  size_unit TEXT DEFAULT 'bytes',
  access_level TEXT CHECK (access_level IN ('public', 'restricted', 'private')),
  repository_url TEXT,
  linked_software TEXT[] DEFAULT '{}',
  linked_outputs TEXT[] DEFAULT '{}',
  linked_trees TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project datasets junction table
CREATE TABLE IF NOT EXISTS public.project_datasets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE CASCADE,
  UNIQUE(project_id, dataset_id)
);

-- Create outputs table
CREATE TABLE IF NOT EXISTS public.outputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('publication', 'software', 'dataset', 'presentation', 'report', 'patent')),
  title TEXT NOT NULL,
  description TEXT,
  authors TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('published', 'submitted', 'in_preparation', 'draft')),
  date TIMESTAMP WITH TIME ZONE,
  url TEXT,
  doi TEXT,
  journal TEXT,
  impact_factor DECIMAL,
  citations INTEGER,
  repository_url TEXT,
  license TEXT,
  file_size BIGINT,
  format TEXT,
  linked_datasets TEXT[] DEFAULT '{}',
  linked_software TEXT[] DEFAULT '{}',
  linked_trees TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project outputs junction table
CREATE TABLE IF NOT EXISTS public.project_outputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  output_id UUID REFERENCES public.outputs(id) ON DELETE CASCADE,
  UNIQUE(project_id, output_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.related_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tree_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_outputs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for projects
CREATE POLICY "Users can view own projects" ON public.projects
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE USING (auth.uid() = created_by);

-- Create RLS policies for project members
CREATE POLICY "Users can view project members" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can manage project members" ON public.project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_members.project_id 
      AND projects.created_by = auth.uid()
    )
  );

-- Create RLS policies for experiment trees
CREATE POLICY "Users can view experiment trees" ON public.experiment_trees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = experiment_trees.project_id 
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can manage experiment trees" ON public.experiment_trees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = experiment_trees.project_id 
      AND projects.created_by = auth.uid()
    )
  );

-- Create RLS policies for software
CREATE POLICY "Users can view software" ON public.software
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage software" ON public.software
  FOR ALL USING (auth.uid() = created_by);

-- Create RLS policies for datasets
CREATE POLICY "Users can view datasets" ON public.datasets
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage datasets" ON public.datasets
  FOR ALL USING (auth.uid() = created_by);

-- Create RLS policies for outputs
CREATE POLICY "Users can view outputs" ON public.outputs
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage outputs" ON public.outputs
  FOR ALL USING (auth.uid() = created_by);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_experiment_trees_updated_at BEFORE UPDATE ON public.experiment_trees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outputs_updated_at BEFORE UPDATE ON public.outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
