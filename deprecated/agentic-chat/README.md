# Deprecated: Agentic Chat Features

**Removed**: December 2024
**Reason**: Simplified AI chat to read-only Q&A functionality

## Overview

These files contained tree-modifying capabilities via AI chat. They are preserved for potential future re-enablement via the `ENABLE_AGENTIC_CHAT` feature flag.

## Files

- `ai-actions-route.ts` - API endpoint for action plan preview and execution
- `ai-action-handler.ts` - Action plan generation using OpenAI function calling
- `ai-action-executor.ts` - Execution of action plans (create, update, delete nodes/blocks)
- `ai-action-schemas.ts` - Function schemas and action intent detection

## Re-Enablement

To re-enable agentic features:

1. Set environment variable: `ENABLE_AGENTIC_CHAT=true`
2. Restore files to original locations:
   - `ai-actions-route.ts` → `app/api/trees/[treeId]/ai-actions/route.ts`
   - `ai-action-handler.ts` → `lib/ai-action-handler.ts`
   - `ai-action-executor.ts` → `lib/ai-action-executor.ts`
   - `ai-action-schemas.ts` → `lib/ai-action-schemas.ts`
3. Restore frontend agent mode UI in `components/AIChatSidebar.tsx`
4. Update imports throughout codebase
5. Test thoroughly before deployment

## See Also

- `REMOVED_FEATURES.md` in project root for user-facing documentation
- `lib/config.ts` for feature flag configuration


