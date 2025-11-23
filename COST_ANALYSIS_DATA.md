# Olvaro Platform - Complete Cost Analysis Data

This document contains all information needed to estimate costs for running Olvaro at scale with users.

---

## 1. AI SERVICES & MODELS

### 1.1 OpenAI Services

#### Embeddings
- **Model**: `text-embedding-3-small`
- **Dimensions**: 384 (reduced from default 1536)
- **Usage**:
  - Node embeddings for semantic search (stored in `node_embeddings` table)
  - Chunk embeddings for document processing (stored in `chunks` table)
  - Generated on: node creation, node content updates, document ingestion
  - Batch processing supported
- **Retry Queue**: Failed embeddings queued in `embedding_queue` table (max 5 retries)

#### Text Generation
- **Primary Model**: `gpt-4o-2024-08-06` (workflow extraction)
- **Fallback Model**: `gpt-4o-mini` (other tasks, JSON generation)
- **Usage**:
  - Workflow extraction from documents (primary use)
  - Node synthesis and planning
  - JSON generation for structured data
  - AI chat responses (if enabled)
- **Token Limits**:
  - GPT-4o: 128k input tokens, 16k output tokens max
  - GPT-4o-mini: 128k input tokens, 16k output tokens max
- **Temperature**: 0.3 for extraction, 0.1 for JSON, 0.7 for chat

#### Audio/Video Transcription
- **Model**: `whisper-1`
- **Usage**: Video and audio file transcription
- **Format**: `verbose_json` with `timestamp_granularities: ['segment']`
- **Files**: MP4, AVI, MOV, QuickTime, MP3, WAV, MPEG

### 1.2 Anthropic (Claude)

#### Text Generation
- **Model**: `claude-3-5-sonnet-20241022` (default)
- **Usage**:
  - Node synthesis
  - Text generation
  - Planning tasks
  - JSON generation (legacy/fallback)
- **Token Limits**: 200k input tokens, 8k output tokens
- **Temperature**: 0.7 default, 0.1 for JSON

### 1.3 Google AI (Gemini)

#### Text Generation
- **Model**: `gemini-1.5-pro`
- **Usage**:
  - Workflow extraction for large documents (>120k tokens)
  - Fallback when OpenAI rate limited
  - Primary for documents >150k tokens
- **Token Limits**: 2M input tokens, 8k output tokens
- **Selection Logic**: 
  - Documents <120k tokens → GPT-4o
  - Documents >120k tokens → Gemini
  - Automatic fallback on rate limits

### 1.4 AI Provider Selection Logic

- **Workflow Extraction**: 
  - Primary: GPT-4o (documents <120k tokens)
  - Fallback: Gemini (documents >120k tokens or rate limited)
- **Embeddings**: OpenAI only (text-embedding-3-small)
- **Other Tasks**: Claude (legacy) or GPT-4o-mini
- **Rate Limiting**: Automatic fallback between providers

---

## 2. INFRASTRUCTURE SERVICES

### 2.1 Supabase

#### Database (PostgreSQL)
- **Extensions Used**:
  - `uuid-ossp` - UUID generation
  - `vector` (pgvector) - Vector embeddings storage
- **Vector Dimensions**: 384 (text-embedding-3-small) and 1536 (legacy chunks)
- **Indexes**:
  - IVFFlat indexes for vector similarity search
  - GIN indexes for JSONB fields
  - Standard B-tree indexes on foreign keys and common queries

#### Storage Buckets
- **Bucket 1**: `user-uploads`
  - **Purpose**: User-scoped file uploads (shared across all user's projects)
  - **File Size Limit**: 100MB per file
  - **Allowed Types**: PDF, Excel (.xlsx, .xls), Text, Markdown, Video (MP4, AVI, MOV, QuickTime), Audio (MP3, WAV, MPEG)
  - **Storage Path Pattern**: `{user_id}/{timestamp}_{filename}`
  
- **Bucket 2**: `project-uploads` (legacy, may still exist)
  - **Purpose**: Project-scoped uploads
  - **File Size Limit**: 100MB per file
  - **Same allowed types as user-uploads**

#### Authentication
- **Provider**: Supabase Auth
- **Features**: Email/password, OAuth (if configured)

#### Real-time Features
- **Server-Sent Events (SSE)**: Progress tracking, status updates
- **Database Subscriptions**: Real-time updates for jobs, nodes, etc.

#### API Usage
- **Database Queries**: All CRUD operations
- **Storage Operations**: Upload, download, delete
- **Auth Operations**: Sign up, sign in, token refresh
- **RLS Policies**: Enabled on all tables

### 2.2 Vercel

#### Hosting
- **Framework**: Next.js 15
- **Deployment**: Serverless functions
- **Edge Functions**: Not currently used
- **Static Assets**: Served from Vercel CDN

#### API Routes (Serverless Functions)
- All `/api/*` routes run as serverless functions
- Background processing via Inngest (not Vercel functions)

### 2.3 Inngest

#### Background Job Processing
- **Functions**:
  1. `preprocess-file` - File preprocessing
  2. `transcribe-video` - Video transcription (placeholder)
  3. `process-chunks` - Text chunking
  4. `generate-embeddings` - Batch embedding generation
  5. `cluster-chunks` - Chunk clustering
  6. `synthesize-nodes` - Node synthesis from chunks

#### Event-Driven Architecture
- Events trigger background jobs
- Webhook endpoint: `/api/inngest`
- Base URL: `NEXT_PUBLIC_SITE_URL` or Vercel URL

---

## 3. DATABASE SCHEMA & DATA TYPES

### 3.1 Core Tables

#### `profiles` / `user_profiles`
- **Columns**: id, email, name, title, institution, department, bio, avatar_url, website, linkedin, orcid, created_at, updated_at
- **Data Types**: UUID, TEXT, TIMESTAMPTZ
- **Size Estimate**: ~500 bytes per user

#### `projects`
- **Columns**: id, name, description, institution, department, status, created_by, created_at, updated_at, visibility
- **Data Types**: UUID, TEXT, TIMESTAMPTZ
- **Size Estimate**: ~1KB per project

#### `project_members`
- **Columns**: id, project_id, user_id, role, joined_at
- **Data Types**: UUID, TEXT, TIMESTAMPTZ
- **Size Estimate**: ~100 bytes per membership

#### `experiment_trees`
- **Columns**: id, project_id, name, description, status, created_by, created_at, updated_at, template_fields (JSONB)
- **Data Types**: UUID, TEXT, JSONB, TIMESTAMPTZ
- **Size Estimate**: ~2KB per tree

#### `tree_nodes`
- **Columns**: id, tree_id, block_id, parent_node_id, name, description, node_type, order_index, metadata (JSONB), created_by, created_at, updated_at
- **Data Types**: UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ
- **Size Estimate**: ~2-5KB per node (depends on metadata)

#### `node_content`
- **Columns**: id, node_id, content, status, version, created_at, updated_at
- **Data Types**: UUID, TEXT, INTEGER, TIMESTAMPTZ
- **Size Estimate**: Variable - can be large (text content)

#### `node_embeddings`
- **Columns**: id, node_id, content_hash, embedding (vector(384)), metadata (JSONB), created_at, updated_at
- **Data Types**: UUID, TEXT, VECTOR(384), JSONB, TIMESTAMPTZ
- **Size Estimate**: ~2KB per embedding (384 dimensions × 4 bytes + overhead)

#### `chunks` (legacy, may still be used)
- **Columns**: id, project_id, source_type, source_ref (JSONB), text, embedding (vector(1536)), metadata (JSONB), created_at, updated_at
- **Data Types**: UUID, TEXT, JSONB, VECTOR(1536), TIMESTAMPTZ
- **Size Estimate**: ~8KB per chunk (1536 dimensions × 4 bytes + text)

#### `structured_documents`
- **Columns**: id, source_id, project_id, document_json (JSONB), created_at
- **Data Types**: UUID, JSONB, TIMESTAMPTZ
- **Size Estimate**: Variable - can be very large (full document structure)

#### `ingestion_sources`
- **Columns**: id, user_id, project_id, source_type, source_name, storage_path, file_size, mime_type, status, error_message, metadata (JSONB), created_by, created_at, updated_at, source_url
- **Data Types**: UUID, TEXT, BIGINT, JSONB, TIMESTAMPTZ
- **Size Estimate**: ~1KB per source
- **User Limit**: 10 files per user (MAX_FILES_PER_USER = 10)

#### `proposed_nodes`
- **Columns**: id, project_id, source_id, node_data (JSONB), confidence, status, created_at, updated_at
- **Data Types**: UUID, JSONB, DECIMAL, TEXT, TIMESTAMPTZ
- **Size Estimate**: ~5-10KB per proposal

#### `jobs`
- **Columns**: id, type, status, payload (JSONB), project_id, progress, started_at, completed_at, created_at, updated_at
- **Data Types**: UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ
- **Size Estimate**: ~2KB per job

#### `embedding_queue`
- **Columns**: id, node_id, retry_count, last_error, next_retry_at, created_at
- **Data Types**: UUID, INTEGER, TEXT, TIMESTAMPTZ
- **Size Estimate**: ~200 bytes per queue item
- **Max Retries**: 5

### 3.2 Supporting Tables

- `tree_blocks` - Block organization for nodes
- `node_attachments` - File attachments to nodes
- `node_links` - Links between nodes
- `node_dependencies` - Dependency relationships
- `tree_versions` - Version control for trees
- `audit_logs` - Audit trail
- `tags` - Tagging system
- `node_tags` - Node-tag relationships
- `comments` - Comments on nodes
- `software` - Software tracking
- `outputs` - Research outputs (publications, datasets)
- `datasets` - Dataset tracking
- `todos` - Task management
- `todo_lists` - Todo list organization
- `todo_assignments` - Task assignments
- `todo_comments` - Task comments
- `work_logs` - Work logging
- `recurring_meetings` - Meeting scheduling
- `user_cloud_tokens` - Encrypted OAuth tokens for cloud storage
- `contact` - Contact form submissions

### 3.3 Vector Storage

- **Embedding Dimensions**: 
  - 384 (current: text-embedding-3-small)
  - 1536 (legacy: chunks table)
- **Index Type**: IVFFlat with cosine distance
- **Storage**: ~1.5KB per 384-dim embedding, ~6KB per 1536-dim embedding

---

## 4. FILE STORAGE

### 4.1 Storage Limits

- **Per File**: 100MB maximum
- **Per User**: 10 files maximum (MAX_FILES_PER_USER = 10)
- **Total Per User**: ~1GB theoretical maximum (10 × 100MB), but limited by file count

### 4.2 File Types Stored

- **Documents**: PDF, Excel (.xlsx, .xls), Text, Markdown
- **Media**: Video (MP4, AVI, MOV, QuickTime), Audio (MP3, WAV, MPEG)
- **Code**: GitHub repositories (metadata only, not full repos)

### 4.3 Storage Operations

- **Upload**: On file import/upload
- **Download**: For processing (PDF parsing, video transcription)
- **Delete**: On source deletion, cleanup operations

---

## 5. API CALL PATTERNS

### 5.1 User Actions Triggering AI Calls

1. **File Upload**:
   - Preprocessing → Embeddings → Workflow Extraction → Node Synthesis
   - Per file: 1-2 embedding calls, 1 workflow extraction call, multiple synthesis calls

2. **Node Creation/Update**:
   - Embedding generation (1 call per node)

3. **Search Queries**:
   - Embedding generation for query (1 call)
   - Vector similarity search (database query, no AI call)

4. **AI Chat** (if enabled):
   - Per message: 1-2 LLM calls (context + response)

### 5.2 Background Processing

- **Inngest Jobs**: Triggered on file upload
- **Embedding Queue**: Retry mechanism for failed embeddings
- **Batch Processing**: Embeddings generated in batches

---

## 6. CLOUD STORAGE INTEGRATIONS

### 6.1 Google Drive
- **API**: Google Drive API v3
- **OAuth Scopes**: `drive.readonly`, `drive.file`
- **Operations**: List files, download files, get metadata
- **Token Storage**: Encrypted in `user_cloud_tokens` table

### 6.2 Microsoft OneDrive/SharePoint
- **API**: Microsoft Graph API
- **OAuth**: OAuth 2.0 with tenant support
- **Operations**: List files, download files, get metadata
- **Token Storage**: Encrypted in `user_cloud_tokens` table

### 6.3 Dropbox
- **API**: Dropbox API v2
- **OAuth**: OAuth 2.0
- **Operations**: List files, download files, get metadata
- **Token Storage**: Encrypted in `user_cloud_tokens` table

### 6.4 GitHub
- **API**: GitHub REST API
- **OAuth**: GitHub OAuth
- **Operations**: Repository access, file listing, code analysis
- **Storage**: Metadata only (not full repo storage)

---

## 7. DATA VOLUME ESTIMATES (Per User)

### 7.1 Database Storage

- **User Profile**: ~500 bytes
- **Projects**: ~1KB × number of projects
- **Project Memberships**: ~100 bytes × number of memberships
- **Experiment Trees**: ~2KB × number of trees
- **Tree Nodes**: ~3KB × number of nodes (with content)
- **Node Embeddings**: ~2KB × number of nodes
- **Ingestion Sources**: ~1KB × 10 (max)
- **Structured Documents**: Variable, can be large (full document JSON)
- **Proposed Nodes**: ~7KB × number of proposals
- **Jobs**: ~2KB × number of jobs

### 7.2 File Storage

- **Per File**: Up to 100MB
- **Per User**: Up to 10 files = ~1GB theoretical max
- **Average**: Likely much less (most files <10MB)

### 7.3 Vector Storage

- **Node Embeddings**: ~2KB per node
- **Chunk Embeddings** (legacy): ~8KB per chunk
- **Index Overhead**: ~20-30% of vector data size

---

## 8. RATE LIMITS & QUOTAS

### 8.1 User Limits

- **Files Per User**: 10 maximum
- **File Size**: 100MB per file

### 8.2 AI Rate Limits

- **OpenAI**: 
  - Rate limits vary by tier
  - Automatic retry with exponential backoff
  - Fallback to Gemini on rate limit
- **Anthropic**: 
  - Rate limits vary by tier
  - Automatic retry with exponential backoff
- **Google AI**: 
  - Rate limits vary by tier
  - Used as fallback for large documents

### 8.3 Processing Limits

- **Embedding Queue**: Max 5 retries per failed embedding
- **Batch Processing**: Configurable batch sizes for embeddings

---

## 9. EXTERNAL API DEPENDENCIES

### 9.1 OAuth Providers
- Google OAuth (for Google Drive)
- Microsoft OAuth (for OneDrive)
- Dropbox OAuth
- GitHub OAuth

### 9.2 Third-Party Services
- None beyond AI providers and OAuth

---

## 10. COST DRIVERS SUMMARY

### High Cost Drivers:
1. **AI API Calls**:
   - Workflow extraction (GPT-4o or Gemini) - expensive for large documents
   - Embeddings (OpenAI) - called frequently
   - Video transcription (Whisper) - per minute of video
   - Node synthesis - multiple calls per document

2. **Database Storage**:
   - Vector embeddings (384-dim per node)
   - Structured documents (large JSONB)
   - Node content (text storage)

3. **File Storage**:
   - Supabase Storage (up to 100MB × 10 files per user)

4. **Background Processing**:
   - Inngest function executions
   - Serverless function invocations (Vercel)

### Medium Cost Drivers:
1. **Database Operations**:
   - Vector similarity searches
   - Complex queries with joins
   - Real-time subscriptions

2. **API Requests**:
   - Vercel serverless function invocations
   - Supabase API calls

### Low Cost Drivers:
1. **Static Assets**: CDN serving (Vercel)
2. **Authentication**: Supabase Auth (usually included)
3. **OAuth Token Storage**: Minimal database storage

---

## 11. SCALING CONSIDERATIONS

### Per User Estimates:
- **Database**: ~50-100KB per user (without heavy usage)
- **Storage**: ~10-100MB per user (depending on file usage)
- **AI Calls**: 
  - ~5-20 embedding calls per user (on file uploads)
  - ~1-5 workflow extraction calls per user
  - ~10-50 node synthesis calls per user
  - Variable video transcription costs

### Growth Patterns:
- **Active Users**: More database queries, more AI calls
- **File Uploads**: Linear growth in storage and processing
- **Node Creation**: Linear growth in embeddings and database size
- **Search Usage**: More vector similarity searches

---

## 12. ENVIRONMENT VARIABLES (Cost-Related)

- `OPENAI_API_KEY` - OpenAI usage
- `ANTHROPIC_API_KEY` - Claude usage
- `GOOGLE_AI_API_KEY` - Gemini usage
- `INNGEST_EVENT_KEY` - Inngest usage
- `INNGEST_SIGNING_KEY` - Inngest webhook security
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase operations
- Cloud storage OAuth keys (Google, Microsoft, Dropbox)

---

## NOTES FOR COST ESTIMATION

1. **Embedding Costs**: Very low per call (~$0.00002 per 1K tokens), but called frequently
2. **Workflow Extraction**: Expensive for large documents (GPT-4o or Gemini)
3. **Video Transcription**: Per-minute pricing for Whisper
4. **Storage**: Supabase Storage pricing per GB
5. **Database**: Supabase database pricing (includes vector storage)
6. **Inngest**: Function execution pricing
7. **Vercel**: Serverless function invocations and bandwidth

Use this data to calculate costs based on:
- Number of users
- Average files per user
- Average nodes per user
- Search query frequency
- Video/audio file usage
- Document sizes


