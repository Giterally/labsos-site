# Experiment Tree Auto-Builder

An AI-powered system that automatically ingests research artifacts (PDFs, code repos, videos, Excel files) and converts them into structured Experiment Trees with semantic chunking, embeddings, and human-in-the-loop review.

## Architecture

- **Frontend**: Next.js with App Router
- **Database**: Supabase (Postgres + pgvector + Storage)
- **Background Jobs**: Inngest
- **AI/LLM**: OpenAI (GPT-4o-mini + text-embedding-3-small)
- **Vector Search**: Supabase pgvector extension

## Features Implemented

### ✅ Core Infrastructure
- Database schema with pgvector support
- Supabase Storage bucket for file uploads
- Inngest background job system
- Row-level security (RLS) policies
- Audit logging system

### ✅ AI/ML Pipeline
- LLM abstraction layer (OpenAI provider)
- Text chunking with tiktoken tokenization
- Embedding generation with batching
- Chunk clustering algorithms
- Node synthesis with confidence scoring
- Provenance tracking and validation

### ✅ File Processing
- PDF text extraction with page markers
- Excel data parsing with sheet awareness
- GitHub repository analysis
- Video transcription (Whisper API)
- Text/markdown processing

### ✅ API Endpoints
- File upload (`/api/import/upload`)
- GitHub import (`/api/import/github`)
- Proposal management (`/api/projects/[projectId]/proposals`)
- Semantic search (`/api/projects/[projectId]/search`)
- Inngest webhook (`/api/inngest`)

### ✅ User Interface
- Import queue page with file upload and GitHub import
- Proposed nodes review interface
- Confidence-based filtering and grouping
- Provenance viewer with source highlighting
- Batch operations (accept, reject, merge)

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=sk-your_openai_api_key_here

# Inngest Configuration
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

### 2. Database Setup

The migrations have been applied to your Supabase database:
- `chunks` table with pgvector embeddings
- `proposed_nodes` table for AI-generated proposals
- `jobs` table for background job tracking
- `ingestion_sources` table for uploaded files
- `tree_versions` table for versioning
- `audit_logs` table for change tracking

### 3. Storage Setup

Storage bucket `project-uploads` has been created with appropriate RLS policies.

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Start Development Server

```bash
pnpm dev
```

## Usage

### 1. Upload Files
- Navigate to `/dashboard/projects/[projectId]/import`
- Upload PDFs, Excel files, videos, or text documents
- Files are automatically processed through the AI pipeline

### 2. Import GitHub Repositories
- Use the GitHub import tab
- Provide repository URL and optional access token
- Repository is cloned and analyzed for code/documentation

### 3. Review Proposed Nodes
- Navigate to `/dashboard/projects/[projectId]/proposals`
- Review AI-generated experiment nodes
- Accept, reject, or merge proposals
- View provenance and confidence scores

### 4. Search Content
- Use semantic search to find relevant chunks and nodes
- Search across all ingested content in a project

## Data Flow

1. **Upload/Import** → File saved to Supabase Storage
2. **Preprocessing** → Extract text/content based on file type
3. **Chunking** → Split content into semantic chunks (~800 tokens)
4. **Embedding** → Generate vector embeddings for each chunk
5. **Clustering** → Group related chunks together
6. **Synthesis** → Generate proposed nodes from clusters
7. **Review** → Human-in-the-loop approval process
8. **Publish** → Add approved nodes to experiment tree

## Node JSON Schema

```json
{
  "title": "string",
  "short_summary": "string",
  "content": {
    "text": "string",
    "structured_steps": [
      {
        "step_no": 1,
        "action": "string",
        "params": {"param_name": "value"}
      }
    ]
  },
  "metadata": {
    "node_type": "Protocol|Data|Software|Result|Instrument",
    "tags": ["..."],
    "status": "in_progress|complete|deprecated",
    "parameters": {"temp": "37C"},
    "estimated_time_minutes": 15
  },
  "links": [{"type": "github|dataset|doi|url", "url": "...", "desc": "..."}],
  "attachments": [{"id": "uuid", "name": "...", "range": "00:01:10-00:01:45"}],
  "provenance": {
    "sources": [{"chunk_id": "uuid", "source_type": "pdf", "snippet": "..."}],
    "generated_by": "node-builder-v1",
    "confidence": 0.87
  }
}
```

## Confidence Scoring

Confidence is calculated based on:
- Number of distinct sources
- Average embedding similarity
- Parameter validation matches
- Missing claims penalty
- Content completeness

Nodes with confidence < 0.6 require manual review.

## Security

- Row-level security (RLS) enabled on all tables
- Users can only access resources from their projects
- File uploads restricted by type and size (100MB limit)
- Audit logging for all user actions

## Monitoring

- Background job status tracking in `jobs` table
- Error handling and retry logic in Inngest functions
- Audit logs for compliance and debugging
- Confidence metrics for quality monitoring

## Next Steps

1. **Set up OpenAI API key** - Get from https://platform.openai.com/
2. **Set up Inngest** - Create account at https://app.inngest.com/
3. **Test with sample data** - Upload a PDF or import a GitHub repo
4. **Monitor job progress** - Check the import queue for processing status
5. **Review proposals** - Accept/reject AI-generated nodes

## Troubleshooting

- Check Inngest dashboard for job failures
- Review audit logs for user actions
- Verify OpenAI API key and usage limits
- Check Supabase logs for database errors
- Ensure file uploads are within size limits

## Cost Considerations

- OpenAI API costs: ~$0.15 per 1M input tokens, ~$0.02 per 1M embedding tokens
- Supabase: Storage and compute costs for vector operations
- Inngest: Free tier includes 50k function runs/month

The system is designed to be cost-effective for MVP usage while maintaining high quality output.
