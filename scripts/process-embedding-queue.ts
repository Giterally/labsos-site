import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { updateNodeEmbedding, type NodeContentData } from '../lib/embeddings';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function processEmbeddingQueue() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('Checking embedding queue...');

  // Get items ready for retry (max 5 retries)
  const { data: queueItems, error } = await supabase
    .from('embedding_queue')
    .select('*')
    .lte('next_retry_at', new Date().toISOString())
    .lt('retry_count', 5)
    .order('next_retry_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching queue:', error);
    process.exit(1);
  }

  if (!queueItems || queueItems.length === 0) {
    console.log('Queue is empty or no items ready for retry');
    process.exit(0);
  }

  console.log(`Processing ${queueItems.length} items from queue...\n`);

  let processed = 0;
  let failed = 0;
  let removed = 0;

  for (const item of queueItems) {
    try {
      // Fetch node data
      const { data: node, error: nodeError } = await supabase
        .from('tree_nodes')
        .select(`
          id,
          name,
          description,
          node_content(content),
          node_attachments(name, description),
          node_links(name, url, description)
        `)
        .eq('id', item.node_id)
        .single();

      if (nodeError || !node) {
        // Node deleted, remove from queue
        await supabase
          .from('embedding_queue')
          .delete()
          .eq('id', item.id);
        
        removed++;
        console.log(`[${item.node_id}] Node deleted, removed from queue`);
        continue;
      }

      const nodeData: NodeContentData = {
        id: node.id,
        name: node.name || '',
        description: node.description || undefined,
        content: node.node_content?.[0]?.content || undefined,
        attachments: node.node_attachments?.map((a: any) => ({
          name: a.name,
          description: a.description || undefined,
        })) || [],
        links: node.node_links?.map((l: any) => ({
          name: l.name,
          url: l.url,
          description: l.description || undefined,
        })) || [],
      };

      // Try to generate embedding
      await updateNodeEmbedding(supabase, item.node_id, nodeData);

      // Success - remove from queue
      await supabase
        .from('embedding_queue')
        .delete()
        .eq('id', item.id);

      processed++;
      console.log(`[${item.node_id}] ✓ Successfully processed (retry ${item.retry_count})`);
    } catch (error) {
      // Failed - increment retry count with exponential backoff
      const nextRetryMinutes = Math.pow(2, item.retry_count) * 5; // 5min, 10min, 20min, 40min, 80min
      const nextRetry = new Date(Date.now() + nextRetryMinutes * 60 * 1000);

      await supabase
        .from('embedding_queue')
        .update({
          retry_count: item.retry_count + 1,
          last_error: error instanceof Error ? error.message : 'Unknown error',
          next_retry_at: nextRetry.toISOString(),
        })
        .eq('id', item.id);

      failed++;
      console.error(`[${item.node_id}] ✗ Failed (retry ${item.retry_count + 1}/5), will retry at ${nextRetry.toISOString()}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Queue processing complete:');
  console.log(`- Processed: ${processed}`);
  console.log(`- Failed (will retry): ${failed}`);
  console.log(`- Removed (node deleted): ${removed}`);
  console.log('='.repeat(50));
}

processEmbeddingQueue()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

