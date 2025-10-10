# Experiment Tree Search Functionality

## Overview
A comprehensive search tool for experiment trees that allows researchers to quickly find and navigate to specific nodes, content, attachments, and links within their experiment structure.

## Features

### 🔍 **Comprehensive Search**
- **Node Content**: Search through node titles, descriptions, and main content
- **Attachments**: Find files, videos, datasets, and other attachments by name and description
- **Links**: Search through external links and their descriptions
- **Metadata**: Search through node types, tags, and other metadata

### ⚡ **Real-time Search**
- **Debounced Input**: 300ms delay to prevent excessive API calls
- **Live Results**: Results update as you type
- **Fuzzy Matching**: Handles typos and approximate terms
- **Smart Scoring**: Results ranked by relevance and match type

### 🎯 **Smart Navigation**
- **Direct Navigation**: Click any result to jump directly to that node
- **Auto-scroll**: Automatically scrolls to selected nodes
- **Context Highlighting**: Shows matching text with surrounding context
- **Path Breadcrumbs**: Displays the full path to each result

### ⌨️ **Keyboard Shortcuts**
- **⌘K (Mac) / Ctrl+K (Windows)**: Quick search activation
- **Arrow Keys**: Navigate through results
- **Enter**: Select highlighted result
- **Escape**: Close search

## User Experience

### For New Researchers (Exploration)
1. **Discover**: Search bar is prominently visible in the top-right corner
2. **Explore**: Type queries to understand tree structure and content
3. **Navigate**: Click results to jump to relevant sections
4. **Context**: See highlighted matches with surrounding content
5. **Learn**: Understand experiment flow through search results

### For Experiment Creators (Quick Access)
1. **Quick Find**: Use ⌘K for instant search activation
2. **Precise Navigation**: Jump directly to specific nodes
3. **Content Search**: Find specific content across all nodes
4. **Edit Mode**: Search results lead directly to editable content

## Technical Implementation

### Components
- **`SearchTool.tsx`**: Main search interface component
- **`useSearch.ts`**: Custom hook for search state management
- **`/api/trees/[treeId]/search/route.ts`**: Search API endpoint

### Search Algorithm
- **Primary**: Full-text search with PostgreSQL
- **Secondary**: Client-side fuzzy matching for typos
- **Indexing**: All node content, attachments, and metadata
- **Performance**: Debounced queries, result caching, request cancellation

### UI/UX Patterns
- **Placement**: Top-right corner (standard web convention)
- **Behavior**: Dropdown results (like GitHub, Notion)
- **Navigation**: Direct node selection with highlighting
- **Feedback**: Loading states, empty states, error handling

## API Endpoints

### GET `/api/trees/[treeId]/search?q={query}`
Searches through all nodes, attachments, and links in the specified tree.

**Parameters:**
- `treeId`: The ID of the experiment tree
- `q`: Search query string

**Response:**
```json
{
  "results": [
    {
      "id": "unique-result-id",
      "type": "node|attachment|link|content",
      "title": "Result title",
      "description": "Result description",
      "content": "Content snippet",
      "nodeType": "protocol|analysis|data_creation|results",
      "nodeId": "node-uuid",
      "nodeTitle": "Node title",
      "path": ["Node", "Section"],
      "matchType": "title|description|content|attachment|link",
      "score": 85
    }
  ]
}
```

## Search Result Types

### Node Results
- **Type**: `node`
- **Matches**: Node titles, descriptions, content
- **Score**: Higher for title matches, lower for content matches

### Attachment Results
- **Type**: `attachment`
- **Matches**: File names, descriptions, metadata
- **Context**: Shows file type and parent node

### Link Results
- **Type**: `link`
- **Matches**: Link names, URLs, descriptions
- **Context**: Shows link type and parent node

### Content Results
- **Type**: `content`
- **Matches**: Text content within nodes
- **Context**: Shows content snippets with highlighted matches

## Performance Optimizations

### Frontend
- **Debouncing**: 300ms delay on input to reduce API calls
- **Request Cancellation**: Cancels previous requests when new ones are made
- **Result Caching**: Caches search results for repeated queries
- **Lazy Loading**: Only loads results when needed

### Backend
- **Database Indexing**: Optimized queries for fast search
- **Result Limiting**: Limits to top 20 results for performance
- **Smart Scoring**: Efficient relevance calculation
- **Error Handling**: Graceful degradation on errors

## Accessibility

### Keyboard Navigation
- Full keyboard support for all search functionality
- Standard keyboard shortcuts (⌘K, Arrow keys, Enter, Escape)
- Focus management and screen reader support

### Visual Design
- High contrast for search results
- Clear visual hierarchy
- Responsive design for all screen sizes
- Loading and error states

## Future Enhancements

### Planned Features
- **Search Filters**: Filter by node type, date, author
- **Search History**: Remember recent searches
- **Saved Searches**: Save frequently used queries
- **Advanced Search**: Boolean operators, exact phrases
- **Search Analytics**: Track popular searches and improve results

### Performance Improvements
- **Full-text Search**: PostgreSQL full-text search integration
- **Search Indexing**: Dedicated search index for faster queries
- **Result Caching**: Server-side result caching
- **Incremental Search**: Search as you type with incremental results
