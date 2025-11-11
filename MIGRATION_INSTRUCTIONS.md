# Migration Instructions: AI Search Feature

## Quick Start

To enable AI search, you need to run the database migration. Follow these steps:

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your LabsOS project

### Step 2: Open SQL Editor
1. Click on **SQL Editor** in the left sidebar
2. Click **New Query**

### Step 3: Run the Migration
1. Open the file: `migrations/039_create_node_embeddings_for_ai_search.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 4: Verify Migration Success
Run this query to verify the function was created:

```sql
SELECT proname, proargnames 
FROM pg_proc 
WHERE proname = 'search_nodes_by_embedding';
```

You should see one row returned.

### Step 5: Generate Initial Embeddings (Optional)
If you have existing nodes, generate embeddings for them:

```bash
pnpm run generate-embeddings
```

## What This Migration Creates

- ✅ `node_embeddings` table - Stores vector embeddings for nodes
- ✅ `embedding_queue` table - Retry queue for failed embeddings
- ✅ `search_nodes_by_embedding()` function - Vector similarity search
- ✅ RLS policies - Security for embeddings
- ✅ Indexes - Performance optimization

## Troubleshooting

### Error: "function already exists"
- This is fine! The migration uses `CREATE OR REPLACE FUNCTION`
- Just run it again - it will update the function

### Error: "relation already exists"
- The tables already exist - this is okay
- The migration uses `CREATE TABLE IF NOT EXISTS`
- Continue with the rest of the migration

### Error: "permission denied"
- Make sure you're running as the database owner
- Or use the service role key in your connection

## Next Steps

After running the migration:
1. ✅ AI search will work in the UI
2. ✅ New nodes will automatically get embeddings
3. ✅ Existing nodes can get embeddings via `pnpm run generate-embeddings`



