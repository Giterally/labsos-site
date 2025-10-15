import { supabase } from './supabase-client';

export interface AuditLogEntry {
  action: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  project_id: string;
  payload?: Record<string, any>;
}

/**
 * Log an audit entry
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await supabase
      .from('audit_logs')
      .insert({
        action: entry.action,
        user_id: entry.user_id,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        project_id: entry.project_id,
        payload: entry.payload || {},
      });
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't throw - audit logging should not break the main flow
  }
}

/**
 * Log node acceptance
 */
export async function logNodeAccepted(
  proposalId: string,
  nodeId: string,
  userId: string,
  projectId: string,
  confidence: number
): Promise<void> {
  await logAudit({
    action: 'node_accepted',
    user_id: userId,
    resource_type: 'proposal',
    resource_id: proposalId,
    project_id: projectId,
    payload: {
      nodeId,
      confidence,
    },
  });
}

/**
 * Log node rejection
 */
export async function logNodeRejected(
  proposalId: string,
  userId: string,
  projectId: string,
  feedback?: string
): Promise<void> {
  await logAudit({
    action: 'node_rejected',
    user_id: userId,
    resource_type: 'proposal',
    resource_id: proposalId,
    project_id: projectId,
    payload: {
      feedback,
    },
  });
}

/**
 * Log node editing
 */
export async function logNodeEdited(
  nodeId: string,
  userId: string,
  projectId: string,
  changes: Record<string, any>
): Promise<void> {
  await logAudit({
    action: 'node_edited',
    user_id: userId,
    resource_type: 'node',
    resource_id: nodeId,
    project_id: projectId,
    payload: {
      changes,
    },
  });
}

/**
 * Log tree publication
 */
export async function logTreePublished(
  treeId: string,
  versionNumber: number,
  userId: string,
  projectId: string
): Promise<void> {
  await logAudit({
    action: 'tree_published',
    user_id: userId,
    resource_type: 'tree',
    resource_id: treeId,
    project_id: projectId,
    payload: {
      versionNumber,
    },
  });
}

/**
 * Log file upload
 */
export async function logFileUploaded(
  sourceId: string,
  fileName: string,
  fileSize: number,
  sourceType: string,
  userId: string,
  projectId: string
): Promise<void> {
  await logAudit({
    action: 'file_uploaded',
    user_id: userId,
    resource_type: 'source',
    resource_id: sourceId,
    project_id: projectId,
    payload: {
      fileName,
      fileSize,
      sourceType,
    },
  });
}

/**
 * Log GitHub import
 */
export async function logGitHubImported(
  sourceId: string,
  repoUrl: string,
  userId: string,
  projectId: string
): Promise<void> {
  await logAudit({
    action: 'github_imported',
    user_id: userId,
    resource_type: 'source',
    resource_id: sourceId,
    project_id: projectId,
    payload: {
      repoUrl,
    },
  });
}

/**
 * Get audit logs for a project
 */
export async function getAuditLogs(
  projectId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        id,
        action,
        user_id,
        resource_type,
        resource_id,
        payload,
        created_at,
        profiles!audit_logs_user_id_fkey (
          full_name,
          email
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
  resourceType: string,
  resourceId: string,
  limit: number = 20
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        id,
        action,
        user_id,
        payload,
        created_at,
        profiles!audit_logs_user_id_fkey (
          full_name,
          email
        )
      `)
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to fetch resource audit logs:', error);
    return [];
  }
}
