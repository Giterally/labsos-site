import { supabase } from './supabase-client'

export interface Project {
  id: string
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'review' | 'completed'
  institution?: string
  department?: string
  visibility: 'public' | 'private'
  created_by: string
  created_at: string
  updated_at: string
}

export interface CreateProjectData {
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'review' | 'completed'
  institution?: string
  department?: string
  visibility: 'public' | 'private'
}

export interface UpdateProjectData extends Partial<CreateProjectData> {
  id: string
}

// Get all projects for the current user
export async function getUserProjects(): Promise<Project[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch projects: ${error.message}`)
  }

  return data || []
}

// Create a new project
export async function createProject(projectData: CreateProjectData): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

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

  return data
}

// Update an existing project
export async function updateProject(projectData: UpdateProjectData): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('projects')
    .update({
      ...projectData,
      updated_at: new Date().toISOString()
    })
    .eq('id', projectData.id)
    .eq('created_by', user.id) // Ensure user owns the project
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update project: ${error.message}`)
  }

  return data
}

// Delete a project
export async function deleteProject(projectId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('created_by', user.id) // Ensure user owns the project

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`)
  }
}

// Get a single project by ID
export async function getProject(projectId: string): Promise<Project | null> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

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

  return data
} 