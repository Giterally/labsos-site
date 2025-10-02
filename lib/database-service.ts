import { supabase } from './supabase'

// ===== PROJECTS =====
export interface Project {
  id: string
  name: string
  description: string | null
  institution: string | null
  department: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  created_by: string | null
  created_at: string
  updated_at: string
  // Related data
  members?: ProjectMember[]
  past_members?: PastMember[]
  related_projects?: RelatedProject[]
  experiment_trees?: ExperimentTree[]
  software?: Software[]
  datasets?: Dataset[]
  outputs?: Output[]
  stats?: ProjectStats
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: string
  initials: string | null
  joined_at: string
  left_at: string | null
  // User data
  name?: string
  email?: string
  avatar_url?: string
}

export interface PastMember {
  id: string
  project_id: string
  name: string
  role: string
  initials: string | null
  duration: string
  avatar_url: string | null
}

export interface RelatedProject {
  id: string
  project_id: string
  related_project_id: string
  similarity_score: number
  similarity_reason: string
  // Related project data
  name?: string
  description?: string
  institution?: string
  department?: string
}

export interface ProjectStats {
  total_trees: number
  active_trees: number
  completed_trees: number
  total_nodes: number
  total_software: number
  total_datasets: number
  total_outputs: number
  total_publications: number
  total_citations: number
}

// ===== EXPERIMENT TREES =====
export interface ExperimentTree {
  id: string
  project_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  category: 'protocol' | 'analysis' | 'data_collection' | 'results'
  node_count: number
  node_types: {
    protocol: number
    data_creation: number
    analysis: number
    results: number
  }
  linked_datasets: string[]
  linked_software: string[]
  linked_outputs: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== SOFTWARE =====
export interface Software {
  id: string
  name: string
  type: 'internal' | 'external'
  category: 'analysis' | 'visualization' | 'data_processing' | 'simulation' | 'other'
  description: string | null
  version: string | null
  license_type: 'free' | 'paid' | 'academic' | 'commercial' | null
  license_cost: number | null
  license_period: 'monthly' | 'yearly' | 'one_time' | null
  repository_url: string | null
  documentation_url: string | null
  used_by: string[]
  linked_datasets: string[]
  linked_outputs: string[]
  created_by: string | null
  last_updated: string
  created_at: string
}

// ===== DATASETS =====
export interface Dataset {
  id: string
  name: string
  type: 'raw_data' | 'processed_data' | 'training_data' | 'validation_data'
  description: string | null
  format: string | null
  file_size: number | null
  size_unit: string
  access_level: 'public' | 'restricted' | 'private'
  repository_url: string | null
  linked_software: string[]
  linked_outputs: string[]
  linked_trees: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== OUTPUTS =====
export interface Output {
  id: string
  type: 'publication' | 'software' | 'dataset' | 'presentation' | 'report' | 'patent'
  title: string
  description: string | null
  authors: string[]
  status: 'published' | 'submitted' | 'in_preparation' | 'draft'
  date: string | null
  url: string | null
  doi: string | null
  journal: string | null
  impact_factor: number | null
  citations: number | null
  repository_url: string | null
  license: string | null
  file_size: number | null
  format: string | null
  linked_datasets: string[]
  linked_software: string[]
  linked_trees: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== AUTHENTICATION HELPERS =====
async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('User not authenticated')
  }
  return user
}

// ===== PROJECT OPERATIONS =====
export async function getUserProjects(): Promise<Project[]> {
  const user = await getCurrentUser()
  
  // Get basic projects first
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch projects: ${error.message}`)
  }

  if (!projects || projects.length === 0) {
    return []
  }

  // For now, return projects with empty related data
  // We'll add the related data in separate queries if needed
  return projects.map(project => ({
    ...project,
    members: [],
    past_members: [],
    related_projects: [],
    experiment_trees: [],
    software: [],
    datasets: [],
    outputs: [],
    stats: {
      total_trees: 0,
      active_trees: 0,
      completed_trees: 0,
      total_nodes: 0,
      total_software: 0,
      total_datasets: 0,
      total_outputs: 0,
      total_publications: 0,
      total_citations: 0
    }
  }))
}

export async function getProject(projectId: string): Promise<Project | null> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('created_by', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Project not found
    }
    throw new Error(`Failed to fetch project: ${error.message}`)
  }

  // For now, return project with empty related data
  return {
    ...data,
    members: [],
    past_members: [],
    related_projects: [],
    experiment_trees: [],
    software: [],
    datasets: [],
    outputs: [],
    stats: {
      total_trees: 0,
      active_trees: 0,
      completed_trees: 0,
      total_nodes: 0,
      total_software: 0,
      total_datasets: 0,
      total_outputs: 0,
      total_publications: 0,
      total_citations: 0
    }
  }
}

export async function createProject(projectData: {
  name: string
  description?: string
  institution?: string
  department?: string
  status?: 'draft' | 'active' | 'completed' | 'archived'
}): Promise<Project> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('projects')
    .insert([{
      ...projectData,
      created_by: user.id
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`)
  }

  return {
    ...data,
    members: [],
    past_members: [],
    related_projects: [],
    experiment_trees: [],
    software: [],
    datasets: [],
    outputs: [],
    stats: {
      total_trees: 0,
      active_trees: 0,
      completed_trees: 0,
      total_nodes: 0,
      total_software: 0,
      total_datasets: 0,
      total_outputs: 0,
      total_publications: 0,
      total_citations: 0
    }
  }
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('projects')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', projectId)
    .eq('created_by', user.id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update project: ${error.message}`)
  }

  return data
}

export async function deleteProject(projectId: string): Promise<void> {
  const user = await getCurrentUser()
  
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('created_by', user.id)

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`)
  }
}

// ===== EXPERIMENT TREE OPERATIONS =====
export async function getExperimentTrees(projectId: string): Promise<ExperimentTree[]> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('experiment_trees')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch experiment trees: ${error.message}`)
  }

  return data || []
}

export async function createExperimentTree(projectId: string, treeData: {
  name: string
  description?: string
  status?: 'draft' | 'active' | 'completed' | 'archived'
  category?: 'protocol' | 'analysis' | 'data_collection' | 'results'
}): Promise<ExperimentTree> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('experiment_trees')
    .insert([{
      ...treeData,
      project_id: projectId,
      created_by: user.id,
      node_types: { protocol: 0, data_creation: 0, analysis: 0, results: 0 }
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create experiment tree: ${error.message}`)
  }

  return data
}

// ===== SOFTWARE OPERATIONS =====
export async function getSoftware(projectId?: string): Promise<Software[]> {
  const user = await getCurrentUser()
  
  let query = supabase
    .from('software')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch software: ${error.message}`)
  }

  return data || []
}

export async function createSoftware(softwareData: {
  name: string
  type: 'internal' | 'external'
  category: 'analysis' | 'visualization' | 'data_processing' | 'simulation' | 'other'
  description?: string
  version?: string
  license_type?: 'free' | 'paid' | 'academic' | 'commercial'
  license_cost?: number
  license_period?: 'monthly' | 'yearly' | 'one_time'
  repository_url?: string
  documentation_url?: string
}): Promise<Software> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('software')
    .insert([{
      ...softwareData,
      created_by: user.id
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create software: ${error.message}`)
  }

  return data
}

// ===== DATASET OPERATIONS =====
export async function getDatasets(projectId?: string): Promise<Dataset[]> {
  const user = await getCurrentUser()
  
  let query = supabase
    .from('datasets')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch datasets: ${error.message}`)
  }

  return data || []
}

export async function createDataset(datasetData: {
  name: string
  type: 'raw_data' | 'processed_data' | 'training_data' | 'validation_data'
  description?: string
  format?: string
  file_size?: number
  size_unit?: string
  access_level: 'public' | 'restricted' | 'private'
  repository_url?: string
}): Promise<Dataset> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('datasets')
    .insert([{
      ...datasetData,
      created_by: user.id
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create dataset: ${error.message}`)
  }

  return data
}

// ===== OUTPUT OPERATIONS =====
export async function getOutputs(projectId?: string): Promise<Output[]> {
  const user = await getCurrentUser()
  
  let query = supabase
    .from('outputs')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch outputs: ${error.message}`)
  }

  return data || []
}

export async function createOutput(outputData: {
  type: 'publication' | 'software' | 'dataset' | 'presentation' | 'report' | 'patent'
  title: string
  description?: string
  authors?: string[]
  status: 'published' | 'submitted' | 'in_preparation' | 'draft'
  date?: string
  url?: string
  doi?: string
  journal?: string
  impact_factor?: number
  citations?: number
  repository_url?: string
  license?: string
  file_size?: number
  format?: string
}): Promise<Output> {
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('outputs')
    .insert([{
      ...outputData,
      created_by: user.id
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create output: ${error.message}`)
  }

  return data
}
