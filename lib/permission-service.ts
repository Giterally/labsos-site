import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectRole = 'Admin'
export type Permission = 'read' | 'write' | 'delete' | 'manage_members' | 'manage_trees'

// All users with Admin role have full permissions
const ADMIN_PERMISSIONS: Permission[] = ['read', 'write', 'delete', 'manage_members', 'manage_trees']

export interface ProjectAccess {
  hasAccess: boolean
  isOwner: boolean
  isMember: boolean
  role: ProjectRole | null
  projectId: string | undefined
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
  canManageMembers: boolean
  canManageTrees: boolean
}

export class PermissionService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Check user's access and permissions for a project
   */
  async checkProjectAccess(projectIdOrSlug: string): Promise<ProjectAccess> {
    // Check if projectIdOrSlug is a UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectIdOrSlug)
    
    // Get project details - try by ID first, then by slug
    let { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('id, created_by, visibility')
      .eq(isUUID ? 'id' : 'slug', projectIdOrSlug)
      .single()

    if (projectError || !project) {
      return this.noAccess()
    }

    // Check if owner
    const isOwner = project.created_by === this.userId
    if (isOwner) {
      return {
        hasAccess: true,
        isOwner: true,
        isMember: true,
        role: 'Admin',
        projectId: project.id,
        canRead: true,
        canWrite: true,
        canDelete: true,
        canManageMembers: true,
        canManageTrees: true
      }
    }

    // Check membership
    const { data: membership } = await this.supabase
      .from('project_members')
      .select('role')
      .eq('project_id', project.id)
      .eq('user_id', this.userId)
      .is('left_at', null)
      .single()

    if (membership) {
      const role = membership.role as ProjectRole
      // All members have Admin role with full permissions
      const permissions = ADMIN_PERMISSIONS
      
      return {
        hasAccess: true,
        isOwner: false,
        isMember: true,
        role,
        projectId: project.id,
        canRead: permissions.includes('read'),
        canWrite: permissions.includes('write'),
        canDelete: permissions.includes('delete'),
        canManageMembers: permissions.includes('manage_members'),
        canManageTrees: permissions.includes('manage_trees')
      }
    }

    // Check if public project (read-only)
    if (project.visibility === 'public') {
      return {
        hasAccess: true,
        isOwner: false,
        isMember: false,
        role: null,
        projectId: project.id,
        canRead: true,
        canWrite: false,
        canDelete: false,
        canManageMembers: false,
        canManageTrees: false
      }
    }

    return this.noAccess()
  }

  /**
   * Check access to experiment tree (inherits from project)
   */
  async checkTreeAccess(treeId: string): Promise<ProjectAccess> {
    const { data: tree } = await this.supabase
      .from('experiment_trees')
      .select('project_id')
      .eq('id', treeId)
      .single()

    if (!tree) return this.noAccess()
    
    return this.checkProjectAccess(tree.project_id)
  }

  /**
   * Check access to tree node (inherits from tree/project)
   */
  async checkNodeAccess(nodeId: string): Promise<ProjectAccess> {
    const { data: node } = await this.supabase
      .from('tree_nodes')
      .select('tree_id')
      .eq('id', nodeId)
      .single()

    if (!node) return this.noAccess()
    
    return this.checkTreeAccess(node.tree_id)
  }

  private noAccess(): ProjectAccess {
    return {
      hasAccess: false,
      isOwner: false,
      isMember: false,
      role: null,
      projectId: undefined,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canManageMembers: false,
      canManageTrees: false
    }
  }
}
