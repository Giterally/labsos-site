# Knowledge Capture - Research Project Management

A comprehensive platform for organizing research projects, experiment trees, software tracking, and output management.

## Features

### 🧪 **Experiment Trees**
- Organize research workflows as sequential steps
- Track protocols, equipment, and procedures
- Version control and collaboration
- **Real-time Progress Tracking**: Cross-tab, cross-session progress updates via Server-Sent Events (SSE)
- **Persistent Progress**: Progress persists through page refreshes and browser restarts

### 💻 **Software Management**
- Track internal and external software tools
- Monitor license costs and renewals
- Repository and documentation links

### 📊 **Output Tracking**
- Publications with impact factors and citations
- Software releases and datasets
- Presentations, reports, and patents

### 👥 **Team Collaboration**
- Researcher profiles and project roles
- Team member management
- Cross-project collaboration

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Icons**: Heroicons

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd LabsOS-postMoazan
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

### 3. Set up the Database

1. In your Supabase dashboard, go to the SQL Editor
2. Copy and paste the contents of `database-schema.sql`
3. Run the SQL to create all tables, indexes, and policies

### 4. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## Database Schema

The application uses the following main tables:

- **profiles**: User information and researcher profiles
- **projects**: Research projects and labs
- **project_members**: Many-to-many relationship between projects and users
- **experiment_trees**: Research workflows and protocols
- **nodes**: Individual steps within experiment trees
- **software**: Software tools and their metadata
- **outputs**: Publications, datasets, and other research outputs
- **attachments**: Files and media associated with nodes
- **tags**: Categorization system for nodes
- **comments**: Discussion and notes on nodes

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/[projectId]` - Get project details
- `GET /api/projects/[projectId]/trees` - List experiment trees
- `POST /api/projects/[projectId]/trees` - Create experiment tree
- `GET /api/projects/[projectId]/software` - List software
- `POST /api/projects/[projectId]/software` - Add software
- `GET /api/projects/[projectId]/outputs` - List outputs
- `POST /api/projects/[projectId]/outputs` - Add output

### Experiment Trees
- `GET /api/projects/[projectId]/trees/[treeId]` - Get tree details
- `GET /api/projects/[projectId]/trees/[treeId]/nodes` - List nodes
- `POST /api/projects/[projectId]/trees/[treeId]/nodes` - Add node

### Researchers
- `GET /api/researcher/[researcherId]` - Get researcher profile

## Adding New Items

The application includes forms for adding:

1. **New Projects**: Create research labs and projects
2. **Experiment Trees**: Organize research workflows
3. **Nodes**: Add individual steps and protocols
4. **Software**: Track tools and their costs
5. **Outputs**: Record publications and datasets

## Authentication

Currently uses localStorage for demo purposes. In production, integrate with Supabase Auth:

```typescript
import { supabase } from '@/lib/supabase'

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues, please open a GitHub issue or contact the development team.
