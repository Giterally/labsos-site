# LabsOS Implementation Plan

## 🎯 Current Status
✅ **Fixed**: Project routing issue - workspace page now works with any project ID  
✅ **Created**: Mock API endpoints for projects  
✅ **Created**: Database schema for Supabase  
✅ **Created**: Basic project dashboard structure  

## 🚀 Next Steps (Phase 1: Core Project Management)

### 1. Set Up Supabase Database
**From your local environment:**
1. Go to [supabase.com](https://supabase.com) and sign in
2. Open your LabsOS project
3. Go to SQL Editor
4. Copy and paste the contents of `database-schema.sql`
5. Run the script to create all tables

**Alternative: Use Supabase CLI**
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Run the schema
supabase db push
```

### 2. Replace Mock APIs with Real Supabase Queries
**Files to update:**
- `app/api/projects/route.ts` - Replace mock data with Supabase queries
- `app/api/projects/[projectId]/route.ts` - Replace mock data with Supabase queries

**Example Supabase query:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fetch projects
const { data: projects, error } = await supabase
  .from('projects')
  .select(`
    *,
    project_members!inner(user_id),
    milestones(*)
  `)
  .eq('project_members.user_id', userId)
```

### 3. Implement Project Creation Flow
**New components needed:**
- `app/projects/new/page.tsx` - New project form
- `app/components/ProjectForm.tsx` - Reusable project form component
- `app/components/ProjectCard.tsx` - Project list item component

**Features:**
- Project name, description, type
- Add team members
- Set start/end dates
- Link to institutions and grants

### 4. Enhance Project Dashboard
**Current features working:**
- ✅ Project overview
- ✅ Team members
- ✅ Basic roadmap
- ✅ Resources (code repos, databases, documents)

**Features to add:**
- 📊 Project progress visualization
- 🗓️ Interactive timeline
- 👥 Member management
- 💰 Grant information
- 🏢 Institution details

## 🎨 Phase 2: Timeline & Milestones

### 1. Interactive Timeline Component
**New component:** `app/components/ProjectTimeline.tsx`
- Vertical timeline with milestones
- Drag & drop milestone reordering
- Click to expand milestone details
- Progress indicators

### 2. Milestone Management
**New pages:**
- `app/workspace/[projectId]/milestones/page.tsx` - Milestone list
- `app/workspace/[projectId]/milestones/[milestoneId]/page.tsx` - Milestone detail
- `app/workspace/[projectId]/milestones/new/page.tsx` - Create milestone

**Features:**
- Create/edit/delete milestones
- Assign team members
- Set due dates
- Track completion status

### 3. Deliverable Tracking
**New pages:**
- `app/workspace/[projectId]/deliverables/page.tsx` - Deliverable list
- `app/workspace/[projectId]/deliverables/[deliverableId]/page.tsx` - Deliverable detail

**Features:**
- Link deliverables to milestones
- Track deliverable status
- Add code repositories
- Upload documents

## 🔧 Phase 3: Code Integration

### 1. Repository Management
**New components:**
- `app/components/RepositoryTree.tsx` - File structure visualization
- `app/components/CodeViewer.tsx` - Basic code display
- `app/components/RepositoryLinker.tsx` - Link GitHub/GitLab repos

**Features:**
- Connect to GitHub/GitLab APIs
- Display repository file structure
- Show commit history
- Basic code syntax highlighting

### 2. Code Review System
**New components:**
- `app/components/CodeReview.tsx` - Review interface
- `app/components/ReviewComments.tsx` - Comment system
- `app/components/ReviewStatus.tsx` - Status tracking

**Integration options:**
- **Option A**: GitHub PR integration (recommended)
- **Option B**: Built-in review system
- **Option C**: GitLab integration

## 📱 Phase 4: Advanced Features

### 1. Real-time Collaboration
- Live updates using Supabase real-time subscriptions
- Collaborative editing of project documents
- Team chat/notifications

### 2. Advanced Analytics
- Project progress metrics
- Team productivity tracking
- Timeline analysis
- Resource utilization

### 3. Export & Reporting
- Project reports (PDF/Word)
- Data exports (CSV/JSON)
- FAIR compliance exports
- Publication-ready summaries

## 🛠️ Technical Implementation Details

### Database Relationships
```
projects (1) ←→ (many) project_members
projects (1) ←→ (many) milestones
milestones (1) ←→ (many) deliverables
deliverables (1) ←→ (many) repositories
deliverables (1) ←→ (many) documents
```

### API Structure
```
/api/projects - Project CRUD
/api/projects/[id] - Individual project
/api/projects/[id]/milestones - Project milestones
/api/projects/[id]/deliverables - Project deliverables
/api/projects/[id]/members - Project team
/api/projects/[id]/grants - Project funding
```

### State Management
- **Local state**: React useState for simple forms
- **Server state**: React Query/SWR for API data
- **Global state**: Context API for user/auth data

### Authentication & Authorization
- Supabase Auth for user management
- Row Level Security (RLS) for data access
- Role-based permissions (PI, Member, Viewer)

## 🚀 Getting Started

### 1. Test Current Fix
```bash
# Your workspace page should now work with any project ID
# Try navigating to: /workspace/08be1632-970e-44ff-8e74-435eb2934571
```

### 2. Set Up Database
- Run the SQL schema in Supabase
- Test basic queries

### 3. Replace Mock APIs
- Update project endpoints to use Supabase
- Test with real data

### 4. Build Project Creation
- Create new project form
- Test project creation flow

## 💡 Architecture Benefits

**Why this approach?**
- ✅ **Single language**: TypeScript everywhere
- ✅ **Modern stack**: Next.js 15, React 19
- ✅ **Scalable**: Supabase handles auth, database, real-time
- ✅ **Cost-effective**: Serverless deployment
- ✅ **Developer experience**: Hot reload, type safety
- ✅ **Future-proof**: Latest React features, server components

**Alternative approaches considered:**
- ❌ **Java backend**: More complex deployment, language switching
- ❌ **Python backend**: Good for ML but overkill for CRUD
- ❌ **Separate frontend/backend**: More complex, deployment overhead

## 🎯 Success Metrics

**Phase 1 Complete When:**
- ✅ Users can create projects
- ✅ Users can view project dashboards
- ✅ Basic team management works
- ✅ Timeline displays correctly

**Phase 2 Complete When:**
- ✅ Interactive timeline works
- ✅ Milestone management complete
- ✅ Deliverable tracking functional

**Phase 3 Complete When:**
- ✅ Repository integration works
- ✅ Code review system functional
- ✅ File structure visualization complete

## 🆘 Need Help?

**Common issues:**
1. **Project not found**: Check API endpoint is working
2. **Database connection**: Verify Supabase credentials
3. **Authentication**: Check RLS policies
4. **Real-time updates**: Verify Supabase real-time is enabled

**Next session focus:**
- Set up Supabase database
- Replace mock APIs with real queries
- Implement project creation flow 