import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface ProjectPermission {
  isOwner: boolean
  isTeamMember: boolean
  canEdit: boolean
  canView: boolean
}

/**
 * Check if a user has permission to access a project
 * @param projectId - The project ID (UUID or slug)
 * @param userId - The user ID (optional, if not provided will check for authenticated user)
 * @returns ProjectPermission object with permission details
 */
export async function checkProjectPermission(
  projectId: string, 
  userId?: string
): Promise<ProjectPermission> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // First, try to find the project by slug or UUID
  let actualProjectId = projectId
  
  // Check if projectId is a slug (not a UUID format)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
  
  if (!isUUID) {
    // It's a slug or name, find the actual project ID
    // First try by slug
    let { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, visibility')
      .eq('slug', projectId)
      .single()
    
    // If not found by slug, try by name
    if (projectError || !project) {
      const { data: projectByName, error: nameError } = await supabase
        .from('projects')
        .select('id, visibility')
        .eq('name', projectId)
        .single()
      
      if (nameError || !projectByName) {
        return {
          isOwner: false,
          isTeamMember: false,
          canEdit: false,
          canView: false
        }
      }
      project = projectByName
    }
    
    actualProjectId = project.id
  } else {
    // Get project visibility for public projects
    const { data: project } = await supabase
      .from('projects')
      .select('visibility')
      .eq('id', actualProjectId)
      .single()
    
    // If it's a public project and no user is provided, allow view access
    if (!userId && project?.visibility === 'public') {
      return {
        isOwner: false,
        isTeamMember: false,
        canEdit: false,
        canView: true
      }
    }
  }

  // If no user ID provided, return no permissions
  if (!userId) {
    return {
      isOwner: false,
      isTeamMember: false,
      canEdit: false,
      canView: false
    }
  }

  // Get project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('created_by, visibility')
    .eq('id', actualProjectId)
    .single()

  if (projectError || !project) {
    return {
      isOwner: false,
      isTeamMember: false,
      canEdit: false,
      canView: false
    }
  }

  // Check if user is project owner
  const isOwner = project.created_by === userId

  // Check if user is team member
  const { data: membership } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', actualProjectId)
    .eq('user_id', userId)
    .is('left_at', null)
    .single()

  const isTeamMember = !!membership

  // Determine permissions
  const canEdit = isOwner || isTeamMember
  const canView = canEdit || project.visibility === 'public'

  return {
    isOwner,
    isTeamMember,
    canEdit,
    canView
  }
}

/**
 * Check if a user has permission to access a tree (inherits from project)
 * @param treeId - The tree ID
 * @param userId - The user ID (optional)
 * @returns ProjectPermission object with permission details
 */
export async function checkTreePermission(
  treeId: string, 
  userId?: string
): Promise<ProjectPermission> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Get the project ID for this tree
  const { data: tree, error: treeError } = await supabase
    .from('experiment_trees')
    .select('project_id')
    .eq('id', treeId)
    .single()

  if (treeError || !tree) {
    return {
      isOwner: false,
      isTeamMember: false,
      canEdit: false,
      canView: false
    }
  }

  // Check project permissions
  return checkProjectPermission(tree.project_id, userId)
}

/**
 * Check if a user has permission to access a node (inherits from tree/project)
 * @param nodeId - The node ID
 * @param userId - The user ID (optional)
 * @returns ProjectPermission object with permission details
 */
export async function checkNodePermission(
  nodeId: string, 
  userId?: string
): Promise<ProjectPermission> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Get the tree ID for this node
  const { data: node, error: nodeError } = await supabase
    .from('tree_nodes')
    .select('tree_id')
    .eq('id', nodeId)
    .single()

  if (nodeError || !node) {
    return {
      isOwner: false,
      isTeamMember: false,
      canEdit: false,
      canView: false
    }
  }

  // Check tree permissions (which will check project permissions)
  return checkTreePermission(node.tree_id, userId)
}
