import { serve } from 'inngest/next';
import { inngest } from '../../../lib/inngest/client';
import {
  preprocessFile,
  transcribeVideo,
  processChunks,
  generateEmbeddings,
  clusterChunks,
  synthesizeNodes,
} from '../../../lib/inngest/functions';

// Serve all Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    preprocessFile,
    transcribeVideo,
    processChunks,
    generateEmbeddings,
    clusterChunks,
    synthesizeNodes,
  ],
});
