import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { updateNodeEmbedding, type NodeContentData } from '../lib/embeddings';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function generateAllEmbeddings() {
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
  
  console.log('Fetching all nodes...');
  
  const { data: nodes, error } = await supabase
    .from('tree_nodes')
    .select(`
      id,
      name,
      description,
      node_content(content),
      node_attachments(name, description),
      node_links(name, url, description)
    `)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching nodes:', error);
    process.exit(1);
  }

  if (!nodes || nodes.length === 0) {
    console.log('No nodes found to process');
    process.exit(0);
  }

  console.log(`Found ${nodes.length} nodes`);
  console.log('Starting embedding generation...\n');

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const progress = `[${i + 1}/${nodes.length}]`;

    try {
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

      const wasUpdated = await updateNodeEmbedding(supabase, node.id, nodeData);
      
      if (wasUpdated) {
        updated++;
        console.log(`${progress} ✓ Updated: ${node.name || node.id}`);
      } else {
        skipped++;
        console.log(`${progress} - Skipped (unchanged): ${node.name || node.id}`);
      }

      // Rate limiting: wait 100ms between requests to avoid hitting OpenAI rate limits
      if (i < nodes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      errors++;
      console.error(`${progress} ✗ Error processing node ${node.id}:`, error);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Embedding generation complete:');
  console.log(`- Updated: ${updated}`);
  console.log(`- Skipped (unchanged): ${skipped}`);
  console.log(`- Errors: ${errors}`);
  console.log('='.repeat(50));
}

generateAllEmbeddings()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

