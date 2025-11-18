# Activity Tracker Migration Guide

## Quick Start

To enable the Activity Tracker feature, you need to run 5 database migrations in order.

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your LabsOS project

### Step 2: Open SQL Editor
1. Click on **SQL Editor** in the left sidebar
2. Click **New Query**

### Step 3: Run Migrations in Order

Run each migration file **one at a time** in this exact order:

#### Migration 048: Create Todo Lists
1. Open `migrations/048_create_todo_lists.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Wait for success confirmation

#### Migration 049: Create Todos
1. Open `migrations/049_create_todos.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run**
5. Wait for success confirmation

#### Migration 050: Create Todo Assignments
1. Open `migrations/050_create_todo_assignments.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run**
5. Wait for success confirmation

#### Migration 051: Create Work Logs
1. Open `migrations/051_create_work_logs.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run**
5. Wait for success confirmation

#### Migration 052: Create Todo Comments
1. Open `migrations/052_create_todo_comments.sql`
2. Copy the **entire contents** of the file
3. Paste it into the SQL Editor
4. Click **Run**
5. Wait for success confirmation

### Step 4: Verify Migration Success

Run this query to verify all tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('todo_lists', 'todos', 'todo_assignments', 'work_logs', 'todo_comments')
ORDER BY table_name;
```

You should see 5 rows returned:
- `todo_assignments`
- `todo_comments`
- `todo_lists`
- `todos`
- `work_logs`

## What These Migrations Create

### Tables Created:
- ✅ `todo_lists` - Personal and shared todo lists
- ✅ `todos` - Individual todo items with status, priority, due dates
- ✅ `todo_assignments` - User assignments to todos (many-to-many)
- ✅ `work_logs` - Work log entries with markdown support
- ✅ `todo_comments` - Comments on todos (for future use)

### Features Enabled:
- ✅ Row-Level Security (RLS) policies
- ✅ Indexes for performance
- ✅ Triggers for auto-updating timestamps
- ✅ Completion tracking
- ✅ Edit tracking for work logs

## Troubleshooting

### Error: "relation already exists"
- The table already exists - this is okay
- The migrations use `CREATE TABLE IF NOT EXISTS`
- Continue with the rest of the migration

### Error: "function already exists"
- This is fine! The migrations use `CREATE OR REPLACE FUNCTION`
- Just run it again - it will update the function

### Error: "permission denied"
- Make sure you're running as the database owner
- Or use the service role key in your connection

### Error: "Could not find the table 'public.todos'"
- This means the migrations haven't been run yet
- Follow the steps above to run all 5 migrations

## Next Steps

After running all migrations:
1. ✅ Refresh your dashboard page
2. ✅ The Activity Tracker should now work
3. ✅ You can create personal and shared todo lists
4. ✅ You can create tasks and work logs

## Quick Test

After migrations, try creating a todo:
1. Go to Dashboard
2. Click "Activity Tracker" tab
3. Click "New Task"
4. Fill in the form and create a task
5. You should see it appear in the list!

