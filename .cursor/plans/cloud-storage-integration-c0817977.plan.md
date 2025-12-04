---
name: AI Chat Attachments, Links, and Tree Hierarchy Enhancement
overview: ""
todos:
  - id: 1f714916-4cef-4ddc-a47a-627b5925f01f
    content: Update TreeContext interface and fetchTreeContext to include file_url, parent_trees, child_trees, and hierarchy_info
    status: pending
  - id: c22b1d68-0a54-4c8e-9e16-2059e28d2903
    content: Update formatTreeContextForLLM to include hierarchy and nesting information with full URLs
    status: pending
  - id: fae3d7f6-8c70-4f28-9961-737e94ed41f3
    content: Enhance AI prompt in generateAnswer to explain tree hierarchy and nesting
    status: pending
  - id: 8c3ff4fd-9518-417f-8046-ec3cd50475c6
    content: Create parseAIResponse helper function in AIChatSidebar to extract attachments/links from AI responses
    status: pending
  - id: 4641d978-ae8a-4304-912e-2ab52ce11fe3
    content: Update AIChatSidebar message rendering to display clickable links, embedded videos, and attachment cards
    status: pending
---

# AI Chat Attachments, Links, and Tree Hierarchy Enhancement

## Overview

Enhance the AI chat to display clickable attachments and links (with YouTube video embeds) and make the AI aware of tree hierarchy and nesting relationships.

## Changes

### 1. Update Tree Context to Include Full Attachment/Link Data and Nesting Info

**File: `lib/tree-context.ts`**

- Update `TreeContext` interface to include:
  - `file_url` in attachments array
  - `parent_trees` array with tree names, descriptions, and which nodes reference this tree
  - `child_trees` array with tree names, descriptions, and which nodes reference them
  - `hierarchy_info` object describing block→node structure and dependency chains

- Update `fetchTreeContext` function:
  - Modify attachment fetch (line 209-213) to include `file_url` in SELECT
  - Add new step to fetch parent trees (trees that reference this tree via `referenced_tree_ids`)
  - Add new step to fetch child trees (trees referenced by nodes in this tree)
  - Build hierarchy summary showing block→node relationships and dependency chains

- Update `formatTreeContextForLLM` function:
  - Add section describing tree hierarchy (blocks contain nodes, dependency chains)
  - Add section describing nesting hierarchy (parent/child trees with positions)
  - Include full URLs for attachments and links in the formatted output

### 2. Enhance AI Prompt for Hierarchy Awareness

**File: `lib/embeddings.ts`**

- Update system prompt in `generateAnswer` function (lines 250-274):
  - Add explanation of tree hierarchy (blocks contain nodes, nodes have dependencies)
  - Add explanation of nesting hierarchy (parent/child trees, positions in nest)
  - Instruct AI to reference attachments/links by name when relevant
  - Explain that attachments/links will be rendered automatically

### 3. Modify AI Response to Include Structured References

**File: `lib/embeddings.ts`**

- Change `generateAnswer` return type to include structured data:
  ```typescript
  { text: string, referencedAttachments?: string[], referencedLinks?: string[] }
  ```

- Use OpenAI function calling or parse response for attachment/link references
- Alternative: Return plain text and parse in frontend (simpler, lower latency)

### 4. Update AI Chat Sidebar to Render Attachments/Links

**File: `components/AIChatSidebar.tsx`**

- Update `ChatMessage` interface to include optional `referencedAttachments` and `referencedLinks` arrays
- Create helper function `parseAIResponse` to:
  - Extract URLs from markdown links and plain text
  - Match attachment names against tree context
  - Detect YouTube URLs for embedding
- Update message rendering (line 540-568):
  - Parse AI response for attachments/links
  - Render clickable links with previews
  - Render embedded YouTube videos using `VideoEmbed` component
  - Render attachment cards for non-video attachments
- Import `VideoEmbed` component and `detectVideoType` utility

### 5. Update API Route to Pass Tree Context

**File: `app/api/trees/[treeId]/ai-search/route.ts`**

- Ensure `fetchTreeContext` is called with full context (already done)
- Return structured response if using function calling approach
- Otherwise, return plain text (parsing happens in frontend)

## Implementation Notes

- Use frontend parsing approach for simplicity and lower latency
- Match attachments by name (case-insensitive, partial matching)
- Match links by URL
- YouTube videos: auto-detect and embed using existing `VideoEmbed` component
- Other attachments: show as clickable cards with file type icons
- Links: render as clickable links with previews where possible

## Testing

- Test with tree containing attachments and links
- Test with nested trees (parent/child relationships)
- Test YouTube video embedding
- Test hierarchy questions (blocks, nodes, dependencies, nesting)