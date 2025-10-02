# Knowledge Capture + Indexing Implementation Plan

## 🎯 Product Overview

This is a research-native workspace that organizes projects as ordered experiment trees (process maps). Each node in the tree represents a canonical artifact (protocol step, video, script, dataset, equipment note). The system preserves the actual order of experiments, making tacit knowledge visible and navigable.

## 🏗️ Current Implementation Status

### ✅ Completed (Part A - Manual Service → Metadata Wrapper)

1. **Database Schema** - Complete experiment tree structure
   - Workspaces (replaces projects)
   - Experiment trees (main organizational structure)
   - Experiment nodes (core content units)
   - Node attachments (files, links, videos)
   - Video transcripts and chapters
   - Node tags and search index
   - Handover packets
   - Code quality checks
   - External integrations

2. **Core UI Components**
   - Workspace dashboard with experiment tree overview
   - Experiment tree interface with collapsible sidebar
   - Node content pane with rich content display
   - Handover export functionality
   - Search and filtering capabilities

3. **API Structure**
   - Workspace management endpoints
   - Experiment tree CRUD operations
   - Node content management
   - Attachment handling

### 🚧 In Progress

1. **Database Integration**
   - Replace mock APIs with Supabase queries
   - Implement Row Level Security (RLS) policies
   - Set up real-time subscriptions

2. **Core Features**
   - Node creation and editing
   - Attachment upload and management
   - Video transcript generation
   - Code quality checks

## 🎯 MVP Feature Set (Part A)

### 1. Ordered Experiment Tree (Primary UI)
- ✅ Sidebar tree that models experiments in sequence
- ✅ Nodes can be nested and reordered
- ✅ Manual node creation with links/artifacts
- 🔄 Drag & drop reordering (next)

### 2. Node Content Pane (Rich Content)
- ✅ Video embedding with transcripts
- ✅ Code file display (syntax highlighting needed)
- ✅ Protocol text and attachments
- ✅ Data preview capabilities
- 🔄 Video chapter creation (next)

### 3. Lightweight Indexing & Search
- ✅ Metadata storage in PostgreSQL
- ✅ Full-text search setup
- 🔄 Search implementation (next)
- 🔄 Tag-based filtering (next)

### 4. Handover Packet + Export
- ✅ Export interface design
- 🔄 HTML → PDF generator (next)
- 🔄 ZIP file creation (next)
- 🔄 Human-friendly summary (next)

### 5. Basic Access Controls
- ✅ Role-based permissions (owner, maintainer, contributor, viewer)
- ✅ Workspace-level access control
- 🔄 Node-level visibility (next)

## 🚀 Next Steps (Immediate)

### 1. Database Setup
```bash
# Run the new schema in Supabase
# Copy contents of database-schema.sql to Supabase SQL Editor
```

### 2. Replace Mock APIs
**Files to update:**
- `app/api/workspaces/[workspaceId]/route.ts`
- `app/api/workspaces/[workspaceId]/trees/[treeId]/route.ts`

**Example Supabase integration:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fetch workspace with experiment trees
const { data: workspace, error } = await supabase
  .from('workspaces')
  .select(`
    *,
    workspace_members!inner(user_id),
    experiment_trees(*)
  `)
  .eq('workspace_members.user_id', userId)
  .eq('id', workspaceId)
```

### 3. Implement Node Management
**New components needed:**
- `components/NodeEditor.tsx` - Create/edit nodes
- `components/AttachmentUpload.tsx` - File upload interface
- `components/VideoPlayer.tsx` - Enhanced video player with chapters

**New pages:**
- `app/workspace/[workspaceId]/trees/[treeId]/nodes/new/page.tsx`
- `app/workspace/[workspaceId]/trees/[treeId]/nodes/[nodeId]/edit/page.tsx`

### 4. Add Search Functionality
**Implementation:**
- Use PostgreSQL full-text search with `tsvector`
- Implement search API endpoint
- Add search UI to experiment tree sidebar

### 5. Video Transcript Generation
**Integration options:**
- **Option A**: OpenAI Whisper API (recommended for MVP)
- **Option B**: AWS Transcribe
- **Option C**: Google Speech-to-Text

**Implementation:**
```typescript
// Example Whisper integration
const generateTranscript = async (videoFile: File) => {
  const formData = new FormData()
  formData.append('file', videoFile)
  formData.append('model', 'whisper-1')
  
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData
  })
  
  return response.json()
}
```

## 🔧 Technical Architecture

### Frontend Stack
- **Framework**: Next.js 15 with React 19
- **Styling**: Tailwind CSS + Radix UI components
- **State Management**: React hooks + Context API
- **Code Viewer**: Monaco Editor (read-only)
- **Video Player**: Custom component with chapter support

### Backend Stack
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage (for MVP)
- **Search**: PostgreSQL full-text search
- **Real-time**: Supabase real-time subscriptions

### Integrations (Phase B)
- **GitHub**: OAuth + read-only repo access
- **OneDrive/Dropbox**: Link ingestion (manual token flow)
- **Video Transcription**: OpenAI Whisper API
- **Code Quality**: Custom linting scripts

## 📱 UI/UX Implementation

### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│ Header: Workspace Name + Export/Share buttons          │
├─────────────┬───────────────────────────────────────────┤
│ Tree Sidebar│ Main Content Area                         │
│ - Search    │ - Node Content (tabs)                     │
│ - Nodes     │ - Attachments                             │
│ - Collapse  │ - Metadata                                │
│             │ - Notes                                   │
└─────────────┴───────────────────────────────────────────┘
```

### Key UX Principles
- **Minimal & Research-first**: Clean interface focused on content
- **Predictable**: Notion-like nested pages + GitHub file viewer
- **Ordered**: Experiments are sequences, not just hierarchies
- **Context-rich**: Keep content next to context

## 🎯 Success Metrics (Part A)

### MVP Complete When:
- ✅ Users can create and navigate experiment trees
- ✅ Users can add nodes with different types (setup, run, analysis, etc.)
- ✅ Users can attach files, videos, and code repositories
- ✅ Users can search across node content and transcripts
- ✅ Users can export handover packages
- ✅ Basic team collaboration works

### Part B Ready When:
- ✅ GitHub integration for code repositories
- ✅ Video transcript generation works
- ✅ Code quality checks are automated
- ✅ OneDrive/Dropbox link ingestion works
- ✅ Advanced search with filters

## 🚀 Getting Started

### 1. Set Up Database
```bash
# Go to Supabase dashboard
# Copy database-schema.sql contents
# Run in SQL Editor
```

### 2. Test Current Implementation
```bash
# Start development server
npm run dev

# Navigate to dashboard
# Create a workspace
# Add an experiment tree
# Test node navigation
```

### 3. Next Development Session
- Set up Supabase database
- Replace mock APIs with real queries
- Implement node creation flow
- Add video transcript generation
- Test handover export functionality

## �� Key Benefits of This Approach

### For Researchers:
- **Tacit Knowledge Capture**: Videos + transcripts make implicit knowledge explicit
- **Ordered Workflows**: Tree structure matches experimental thinking
- **Easy Handover**: One-click export for project transitions
- **No Migration**: Link-first approach preserves existing storage

### For Labs:
- **Low Friction**: No forced migration from existing tools
- **Cost Effective**: Minimal storage costs with link-first model
- **Scalable**: Can grow from manual service to full platform
- **Compliant**: Meets funder requirements for data management

### For PIs:
- **Project Visibility**: Clear view of experiment progress
- **Knowledge Retention**: Reduces loss when people leave
- **Reproducibility**: Structured protocols improve repeatability
- **Handover Ready**: Professional packages for project transitions

## 🆘 Common Issues & Solutions

### Database Connection
- **Issue**: Supabase connection fails
- **Solution**: Check environment variables and RLS policies

### File Uploads
- **Issue**: Large video files fail to upload
- **Solution**: Implement chunked uploads or use external storage

### Search Performance
- **Issue**: Slow search on large trees
- **Solution**: Add proper indexes and consider Elasticsearch for scale

### Video Processing
- **Issue**: Transcript generation takes too long
- **Solution**: Use background jobs and show progress indicators

## 🔮 Future Roadmap

### Phase B: Wrapper SaaS (Next 3-6 months)
- GitHub/GitLab integration
- OneDrive/Dropbox link ingestion
- Automated video transcription
- Code quality automation
- Advanced search and filtering

### Phase C: Full Platform (6-12 months)
- Data hosting and management
- Inventory management
- LIMS integrations
- Enterprise features
- Multi-tenant architecture

This implementation focuses on Part A (Manual Service → Metadata Wrapper) as the foundation for proving value and building trust before scaling to automated integrations.
