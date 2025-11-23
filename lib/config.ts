/**
 * Feature flags configuration
 * Controls optional features that can be enabled/disabled via environment variables
 */

export const FEATURE_FLAGS = {
  /**
   * Enable agentic chat features (tree modifications via AI)
   * Default: false - agentic features are disabled
   * Set ENABLE_AGENTIC_CHAT=true in .env.local to re-enable
   */
  ENABLE_AGENTIC_CHAT: process.env.ENABLE_AGENTIC_CHAT === 'true',
} as const;


