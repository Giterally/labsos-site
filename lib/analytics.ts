/**
 * Analytics logging for AI chat system
 * Privacy-safe logging of modification attempts
 */

/**
 * Hash a string for privacy-safe logging
 */
function hashString(str: string): string {
  // Simple hash function (not cryptographically secure, but sufficient for analytics)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Detect modification type from query
 */
function detectModificationType(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('create') || lower.includes('add') || lower.includes('new')) return 'create';
  if (lower.includes('update') || lower.includes('edit') || lower.includes('change') || lower.includes('modify')) return 'update';
  if (lower.includes('delete') || lower.includes('remove')) return 'delete';
  if (lower.includes('move') || lower.includes('reorder')) return 'move';
  return 'other';
}

/**
 * Log modification attempt for analytics
 * Privacy-safe: hashes query text to avoid storing PII
 */
export function logModificationAttempt(query: string, treeId: string): void {
  const queryHash = hashString(query);
  
  // Log to console (in production, send to analytics service)
  console.log('AI chat modification attempt:', {
    query_hash: queryHash,
    tree_id: treeId,
    timestamp: new Date().toISOString(),
    query_length: query.length,
    modification_type: detectModificationType(query),
  });
  
  // TODO: Integrate with your analytics service (e.g., PostHog, Mixpanel, etc.)
  // Example:
  // analytics.track('ai_chat_modification_attempt', {
  //   query_hash: queryHash,
  //   tree_id: treeId,
  //   timestamp: new Date().toISOString(),
  //   query_length: query.length,
  //   modification_type: detectModificationType(query),
  // });
}


