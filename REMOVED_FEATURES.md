# Removed Features Log

## Agentic AI Chat (Removed: December 2024)

### What Was Removed

- AI-powered tree modifications via natural language
- Action plan generation and preview
- Node/block creation, updating, deletion via chat
- Agent mode toggle in chat UI

### Why Removed

- Simplified AI chat to focus on Q&A and analysis
- Users can still make all modifications via tree editor UI
- Reduces complexity and potential for unintended changes

### Technical Details

- Feature flag: `ENABLE_AGENTIC_CHAT` (default: false)
- Archived code: `deprecated/agentic-chat/`
- For re-enablement instructions, see archived README

### Impact

- AI chat remains fully functional for questions, explanations, and suggestions
- Users now make modifications manually via tree editor
- Semantic search and intelligent context selection unchanged

### User Experience

When users request modifications (e.g., "create a new node"), the AI assistant will:
1. Acknowledge the request warmly
2. Explain it cannot make direct changes
3. Provide specific guidance on how to do it manually
4. Offer helpful suggestions about what should be included

Example response:
> "I can help you plan your data analysis step, but I cannot create nodes directly. To create a new node, click the '+' button in the tree editor next to the 'Analysis' block. Based on your current tree structure, I'd suggest adding this after the 'Data Collection Summary' node. Would you like me to suggest specific analysis methods?"


