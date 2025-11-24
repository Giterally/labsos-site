import { serve } from 'inngest/next';
import { inngest } from '../../../lib/inngest/client';
import {
  preprocessFile,
  transcribeVideo,
} from '../../../lib/inngest/functions';

// Serve all Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    preprocessFile,
    transcribeVideo,
  ],
  // Configure base URL for production - Inngest needs to know where to call back
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
});
