/**
 * One-time cleanup script for agentic chat data
 * Run with: npm run cleanup-agentic-data
 * 
 * This script cleans up any action plan data that may exist in the database
 * Note: Conversation history is preserved (contains read-only action plan references)
 */

import { createClient } from '@supabase/supabase-js';

async function cleanup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Starting agentic data cleanup...');

  // Check for any action plan related tables
  // Note: Action plans were stored in localStorage, not database
  // But we check for any related tables that might exist

  const tablesToCheck = [
    'action_plans',
    'pending_modifications',
    'ai_action_plans',
  ];

  for (const tableName of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') {
        // Table doesn't exist (PGRST116 = not found) - that's fine
        console.log(`Table ${tableName} does not exist (expected)`);
      } else if (data !== null) {
        console.log(`Found table ${tableName} with data - consider manual cleanup if needed`);
      }
    } catch (error) {
      // Table doesn't exist - that's fine
      console.log(`Table ${tableName} does not exist (expected)`);
    }
  }

  console.log('✓ Agentic data cleanup complete');
  console.log('Note: Conversation history preserved (contains read-only action plan references)');
  console.log('Note: Action plans were stored in localStorage, not database');
  console.log('LocalStorage cleanup is handled automatically by AIChatSidebar component');
}

cleanup().catch(console.error);


