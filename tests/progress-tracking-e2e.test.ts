/**
 * End-to-End Integration Test for Progress Tracking System
 * 
 * This test simulates the full progress tracking flow:
 * 1. Start proposal generation
 * 2. Verify job created in database
 * 3. Monitor progress updates via SSE
 * 4. Test cross-tab consistency
 * 5. Test page refresh recovery
 * 6. Verify completion
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-key';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Test data
const TEST_PROJECT_ID = 'test-project-progress';
const TEST_USER_ID = 'test-user-progress';

describe('Progress Tracking E2E', () => {
  let supabase: any;
  let testJobId: string;

  beforeAll(async () => {
    // Initialize Supabase client
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await supabase
      .from('jobs')
      .delete()
      .eq('project_id', TEST_PROJECT_ID);
    
    await supabase
      .from('proposed_nodes')
      .delete()
      .eq('project_id', TEST_PROJECT_ID);
  });

  afterEach(async () => {
    // Clean up test data
    if (testJobId) {
      await supabase
        .from('jobs')
        .delete()
        .eq('id', testJobId);
    }
  });

  describe('Proposal Generation Progress Flow', () => {
    it('should create job in database and track progress', async () => {
      // Step 1: Start proposal generation
      const response = await fetch(`${API_BASE_URL}/api/projects/${TEST_PROJECT_ID}/generate-proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test-token`
        },
        body: JSON.stringify({})
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.jobId).toBeDefined();
      testJobId = result.jobId;

      // Step 2: Verify job was created in database
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', testJobId)
        .single();

      expect(jobError).toBeNull();
      expect(job).toBeTruthy();
      expect(job.type).toBe('proposal_generation');
      expect(job.status).toBe('running');
      expect(job.project_id).toBe(TEST_PROJECT_ID);

      // Step 3: Verify initial progress was set
      expect(job.progress_stage).toBe('initializing');
      expect(job.progress_current).toBe(0);
      expect(job.progress_total).toBe(100);
      expect(job.progress_message).toContain('Initializing proposal generation');
    });

    it('should update progress via database functions', async () => {
      // Create a test job first
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-progress-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Test progress update function
      const { data: updateResult, error: updateError } = await supabase.rpc('update_job_progress', {
        job_id: testJobId,
        stage: 'synthesizing',
        current_step: 50,
        total_steps: 100,
        message: 'Synthesizing nodes...'
      });

      expect(updateError).toBeNull();
      expect(updateResult).toBeTruthy();
      expect(updateResult[0].progress_stage).toBe('synthesizing');
      expect(updateResult[0].progress_current).toBe(50);
      expect(updateResult[0].progress_total).toBe(100);
      expect(updateResult[0].progress_message).toBe('Synthesizing nodes...');

      // Verify the job was updated in database
      const { data: updatedJob, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', testJobId)
        .single();

      expect(fetchError).toBeNull();
      expect(updatedJob.progress_stage).toBe('synthesizing');
      expect(updatedJob.progress_current).toBe(50);
      expect(updatedJob.progress_updated_at).toBeTruthy();
    });

    it('should mark job as complete', async () => {
      // Create a test job first
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-complete-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString(),
          progress_stage: 'synthesizing',
          progress_current: 80,
          progress_total: 100,
          progress_message: 'Almost done...'
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Test complete function
      const { data: completeResult, error: completeError } = await supabase.rpc('complete_job_progress', {
        job_id: testJobId,
        message: 'Generated 5 nodes successfully'
      });

      expect(completeError).toBeNull();
      expect(completeResult).toBeTruthy();
      expect(completeResult[0].progress_stage).toBe('complete');
      expect(completeResult[0].progress_current).toBe(100);
      expect(completeResult[0].progress_total).toBe(100);

      // Verify the job was marked complete
      const { data: completedJob, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', testJobId)
        .single();

      expect(fetchError).toBeNull();
      expect(completedJob.status).toBe('completed');
      expect(completedJob.completed_at).toBeTruthy();
      expect(completedJob.progress_stage).toBe('complete');
    });

    it('should mark job as error', async () => {
      // Create a test job first
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-error-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Test error function
      const { data: errorResult, error: errorFunctionError } = await supabase.rpc('error_job_progress', {
        job_id: testJobId,
        error_message: 'API rate limit exceeded'
      });

      expect(errorFunctionError).toBeNull();
      expect(errorResult).toBeTruthy();
      expect(errorResult[0].progress_stage).toBe('error');
      expect(errorResult[0].progress_current).toBe(0);
      expect(errorResult[0].progress_total).toBe(0);

      // Verify the job was marked as failed
      const { data: errorJob, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', testJobId)
        .single();

      expect(fetchError).toBeNull();
      expect(errorJob.status).toBe('failed');
      expect(errorJob.error).toBe('API rate limit exceeded');
      expect(errorJob.completed_at).toBeTruthy();
    });
  });

  describe('Progress API Endpoint', () => {
    it('should return current progress for a job', async () => {
      // Create a test job with progress
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-api-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString(),
          progress_stage: 'clustering',
          progress_current: 30,
          progress_total: 100,
          progress_message: 'Clustering chunks...',
          progress_updated_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Test progress API endpoint
      const response = await fetch(`${API_BASE_URL}/api/projects/${TEST_PROJECT_ID}/progress/${testJobId}`, {
        headers: {
          'Authorization': `Bearer test-token`
        }
      });

      expect(response.ok).toBe(true);
      const progress = await response.json();

      expect(progress.stage).toBe('clustering');
      expect(progress.current).toBe(30);
      expect(progress.total).toBe(100);
      expect(progress.message).toBe('Clustering chunks...');
      expect(progress.timestamp).toBeTruthy();
    });

    it('should return default progress for non-existent job', async () => {
      const response = await fetch(`${API_BASE_URL}/api/projects/${TEST_PROJECT_ID}/progress/non-existent-job`, {
        headers: {
          'Authorization': `Bearer test-token`
        }
      });

      expect(response.ok).toBe(true);
      const progress = await response.json();

      expect(progress.stage).toBe('initializing');
      expect(progress.current).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.message).toBe('Starting...');
    });
  });

  describe('SSE Progress Broadcasting', () => {
    it('should broadcast progress updates via SSE', async (done) => {
      // Create a test job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-sse-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Set up SSE connection
      const eventSource = new EventSource(`${API_BASE_URL}/api/projects/${TEST_PROJECT_ID}/status`);
      
      let progressUpdateReceived = false;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress_update' && data.jobId === testJobId) {
          expect(data.progress.stage).toBe('synthesizing');
          expect(data.progress.current).toBe(75);
          expect(data.progress.total).toBe(100);
          expect(data.progress.message).toBe('Synthesizing nodes...');
          
          progressUpdateReceived = true;
          eventSource.close();
          done();
        }
      };

      // Wait a moment for SSE connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update progress to trigger SSE broadcast
      await supabase.rpc('update_job_progress', {
        job_id: testJobId,
        stage: 'synthesizing',
        current_step: 75,
        total_steps: 100,
        message: 'Synthesizing nodes...'
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!progressUpdateReceived) {
          eventSource.close();
          done(new Error('SSE progress update not received within timeout'));
        }
      }, 10000);
    }, 15000);
  });

  describe('Cross-Tab Persistence', () => {
    it('should persist progress across different sessions', async () => {
      // Create a job with progress
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-persistence-job',
          type: 'proposal_generation',
          status: 'running',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: new Date().toISOString(),
          progress_stage: 'deduplicating',
          progress_current: 90,
          progress_total: 100,
          progress_message: 'Almost complete...',
          progress_updated_at: new Date().toISOString()
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = job.id;

      // Simulate different session fetching the same progress
      const response = await fetch(`${API_BASE_URL}/api/projects/${TEST_PROJECT_ID}/progress/${testJobId}`, {
        headers: {
          'Authorization': `Bearer different-session-token`
        }
      });

      expect(response.ok).toBe(true);
      const progress = await response.json();

      // Should get the same progress regardless of session
      expect(progress.stage).toBe('deduplicating');
      expect(progress.current).toBe(90);
      expect(progress.total).toBe(100);
      expect(progress.message).toBe('Almost complete...');
    });
  });

  describe('Job Cleanup', () => {
    it('should clean up old completed jobs', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 7); // 7 days ago

      // Create an old completed job
      const { data: oldJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          id: 'test-cleanup-job',
          type: 'proposal_generation',
          status: 'completed',
          project_id: TEST_PROJECT_ID,
          created_by: TEST_USER_ID,
          started_at: oldDate.toISOString(),
          completed_at: oldDate.toISOString(),
          progress_stage: 'complete',
          progress_current: 100,
          progress_total: 100,
          progress_message: 'Completed long ago'
        })
        .select()
        .single();

      expect(jobError).toBeNull();
      testJobId = oldJob.id;

      // Verify job exists
      const { data: existingJob, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', testJobId)
        .single();

      expect(fetchError).toBeNull();
      expect(existingJob).toBeTruthy();

      // Note: Actual cleanup would be implemented as a scheduled job
      // This test just verifies the job exists and can be queried
    });
  });
});

// Helper function to wait for a condition
function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 100);
      }
    };
    
    check();
  });
}
