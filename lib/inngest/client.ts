import { Inngest } from 'inngest';

// Initialize Inngest client
export const inngest = new Inngest({
  id: 'labsos-experiment-builder',
  name: 'LabsOS Experiment Tree Auto-Builder',
  eventKey: process.env.INNGEST_EVENT_KEY || 'local-dev-key',
});

// Event types
export interface Events {
  'ingestion/preprocess-file': {
    data: {
      sourceId: string;
      projectId: string;
      sourceType: string;
      storagePath: string;
      metadata: Record<string, any>;
    };
  };
  'ingestion/transcribe-video': {
    data: {
      sourceId: string;
      projectId: string;
      storagePath: string;
      metadata: Record<string, any>;
    };
  };
  'ingestion/chunk-text': {
    data: {
      sourceId: string;
      projectId: string;
      text: string;
      sourceType: string;
      metadata: Record<string, any>;
    };
  };
  'ingestion/generate-embeddings': {
    data: {
      projectId: string;
      chunkIds: string[];
    };
  };
  'ingestion/cluster-chunks': {
    data: {
      projectId: string;
    };
  };
  'ingestion/synthesize-nodes': {
    data: {
      projectId: string;
      clusterIds: string[];
    };
  };
  'ingestion/validate-node': {
    data: {
      proposalId: string;
      nodeJson: any;
      chunkIds: string[];
    };
  };
  'ingestion/complete-processing': {
    data: {
      sourceId: string;
      projectId: string;
      status: 'completed' | 'failed';
      error?: string;
    };
  };
}

// Helper function to send events
export async function sendEvent<T extends keyof Events>(
  eventName: T,
  data: Events[T]['data']
) {
  try {
    // In local development without Inngest, just log the event
    if (!process.env.INNGEST_EVENT_KEY) {
      console.log(`[LOCAL DEV] Would send event: ${eventName}`, data);
      return;
    }
    
    await inngest.send({
      name: eventName,
      data,
    });
  } catch (error) {
    console.error(`Failed to send event ${eventName}:`, error);
    // In local development, don't throw errors for Inngest failures
    if (!process.env.INNGEST_EVENT_KEY) {
      console.log(`[LOCAL DEV] Ignoring Inngest error for ${eventName}`);
      return;
    }
    throw error;
  }
}

// Helper function to send multiple events
export async function sendEvents(events: Array<{ name: keyof Events; data: any }>) {
  try {
    await inngest.send(events);
  } catch (error) {
    console.error('Failed to send events:', error);
    throw error;
  }
}
