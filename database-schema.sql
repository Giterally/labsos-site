-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    institution TEXT,
    department TEXT,
    bio TEXT,
    avatar_url TEXT,
    website TEXT,
    linkedin TEXT,
    orcid TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    institution TEXT,
    department TEXT,
    status TEXT CHECK (status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project members table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- Create experiment trees table
CREATE TABLE IF NOT EXISTS public.experiment_trees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('draft', 'active', 'completed', 'archived')) DEFAULT 'draft',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create nodes table for experiment tree steps
CREATE TABLE IF NOT EXISTS public.nodes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tree_id UUID REFERENCES public.experiment_trees(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    node_type TEXT CHECK (node_type IN ('setup', 'calibration', 'run', 'analysis', 'post_processing', 'handover', 'protocol', 'equipment', 'data', 'code', 'video')) DEFAULT 'protocol',
    content TEXT,
    step_number INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create software table
CREATE TABLE IF NOT EXISTS public.software (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('internal', 'external')) NOT NULL,
    category TEXT CHECK (category IN ('analysis', 'visualization', 'data_processing', 'simulation', 'other')) NOT NULL,
    description TEXT,
    version TEXT,
    license_type TEXT CHECK (license_type IN ('free', 'paid', 'academic', 'commercial')),
    license_cost DECIMAL(10,2),
    license_period TEXT CHECK (license_period IN ('monthly', 'yearly', 'one_time')),
    repository_url TEXT,
    documentation_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create software users table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.software_users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    software_id UUID REFERENCES public.software(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(software_id, user_id)
);

-- Create outputs table
CREATE TABLE IF NOT EXISTS public.outputs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('publication', 'software', 'dataset', 'presentation', 'report', 'patent')) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('published', 'submitted', 'in_preparation', 'draft')) DEFAULT 'draft',
    date DATE NOT NULL,
    url TEXT,
    doi TEXT,
    journal TEXT,
    impact_factor DECIMAL(5,2),
    citations INTEGER DEFAULT 0,
    repository_url TEXT,
    license TEXT,
    file_size BIGINT,
    format TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create output authors table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.output_authors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    output_id UUID REFERENCES public.outputs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(output_id, user_id)
);

-- Create attachments table for nodes
CREATE TABLE IF NOT EXISTS public.attachments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    attachment_type TEXT CHECK (attachment_type IN ('image', 'video', 'document', 'code', 'data')) NOT NULL,
    url TEXT,
    file_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tags table
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create node tags table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.node_tags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(node_id, tag_id)
);

-- Create comments table for nodes
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_experiment_trees_project_id ON public.experiment_trees(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_tree_id ON public.nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_software_project_id ON public.software(project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_project_id ON public.outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_node_id ON public.attachments(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_node_id ON public.node_tags(node_id);
CREATE INDEX IF NOT EXISTS idx_comments_node_id ON public.comments(node_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.software_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic policies - you may want to customize these)
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view projects they are members of" ON public.projects
    FOR SELECT USING (
        id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Project members can update projects" ON public.projects
    FOR UPDATE USING (
        id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

-- Similar policies for other tables...
-- (You can add more specific policies based on your requirements)

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updating timestamps
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_experiment_trees_updated_at BEFORE UPDATE ON public.experiment_trees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nodes_updated_at BEFORE UPDATE ON public.nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_software_updated_at BEFORE UPDATE ON public.software
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outputs_updated_at BEFORE UPDATE ON public.outputs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
