/**
 * Unit tests for ProgressTracker with database persistence
 */

import { progressTracker, ProgressUpdate } from '../progress-tracker';
import { supabaseServer } from '../supabase-server';

// Mock Supabase
jest.mock('../supabase-server', () => ({
  supabaseServer: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(() => ({
          not: jest.fn(() => ({
            data: [],
            error: null
          }))
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { id: 'test-job-id' },
            error: null
          }))
        }))
      })),
      eq: jest.fn(() => ({
        single: jest.fn(() => ({
          data: {
            progress_stage: 'synthesizing',
            progress_current: 50,
            progress_total: 100,
            progress_message: 'Test message',
            progress_updated_at: new Date().toISOString()
          },
          error: null
        }))
      }))
    })),
    rpc: jest.fn(() => ({
      data: { id: 'test-job-id' },
      error: null
    }))
  }
}));

describe('ProgressTracker', () => {
  beforeEach(() => {
    // Clear any existing state
    jest.clearAllMocks();
  });

  describe('updateWithPersistence', () => {
    it('should update database and in-memory cache', async () => {
      const jobId = 'test-job-123';
      const progress: Omit<ProgressUpdate, 'timestamp'> = {
        stage: 'synthesizing',
        current: 50,
        total: 100,
        message: 'Test progress update'
      };

      await progressTracker.updateWithPersistence(jobId, progress);

      // Verify database was called
      expect(supabaseServer.rpc).toHaveBeenCalledWith('update_job_progress', {
        job_id: jobId,
        stage: 'synthesizing',
        current_step: 50,
        total_steps: 100,
        message: 'Test progress update'
      });

      // Verify in-memory cache was updated
      const cached = progressTracker.get(jobId);
      expect(cached).toBeTruthy();
      expect(cached?.stage).toBe('synthesizing');
      expect(cached?.current).toBe(50);
      expect(cached?.total).toBe(100);
      expect(cached?.message).toBe('Test progress update');
    });

    it('should continue with in-memory update if database fails', async () => {
      const jobId = 'test-job-456';
      const progress: Omit<ProgressUpdate, 'timestamp'> = {
        stage: 'clustering',
        current: 25,
        total: 100,
        message: 'Test with DB error'
      };

      // Mock database error
      (supabaseServer.rpc as jest.Mock).mockReturnValueOnce({
        data: null,
        error: new Error('Database connection failed')
      });

      await progressTracker.updateWithPersistence(jobId, progress);

      // Verify in-memory cache was still updated despite DB error
      const cached = progressTracker.get(jobId);
      expect(cached).toBeTruthy();
      expect(cached?.stage).toBe('clustering');
      expect(cached?.current).toBe(25);
    });
  });

  describe('getWithFallback', () => {
    it('should return cached data if available', async () => {
      const jobId = 'test-job-789';
      const progress: Omit<ProgressUpdate, 'timestamp'> = {
        stage: 'initializing',
        current: 10,
        total: 100,
        message: 'Cached progress'
      };

      // Set up cache first
      progressTracker.update(jobId, progress);

      const result = await progressTracker.getWithFallback(jobId);

      expect(result).toBeTruthy();
      expect(result?.stage).toBe('initializing');
      expect(result?.current).toBe(10);
      expect(result?.message).toBe('Cached progress');
    });

    it('should fallback to database if not in cache', async () => {
      const jobId = 'test-job-db-fallback';

      const result = await progressTracker.getWithFallback(jobId);

      // Verify database was queried
      expect(supabaseServer.from).toHaveBeenCalledWith('jobs');
      
      expect(result).toBeTruthy();
      expect(result?.stage).toBe('synthesizing');
      expect(result?.current).toBe(50);
      expect(result?.total).toBe(100);
    });

    it('should return null if not found anywhere', async () => {
      const jobId = 'test-job-not-found';

      // Mock database to return no data
      (supabaseServer.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: new Error('Not found')
            }))
          }))
        }))
      });

      const result = await progressTracker.getWithFallback(jobId);

      expect(result).toBeNull();
    });
  });

  describe('completeWithPersistence', () => {
    it('should mark job as complete in database and cache', async () => {
      const jobId = 'test-job-complete';
      const message = 'Generation completed successfully';

      await progressTracker.completeWithPersistence(jobId, message);

      // Verify database complete function was called
      expect(supabaseServer.rpc).toHaveBeenCalledWith('complete_job_progress', {
        job_id: jobId,
        message: message
      });

      // Verify cache was updated
      const cached = progressTracker.get(jobId);
      expect(cached).toBeTruthy();
      expect(cached?.stage).toBe('complete');
      expect(cached?.current).toBe(100);
      expect(cached?.total).toBe(100);
      expect(cached?.message).toBe(message);
    });
  });

  describe('errorWithPersistence', () => {
    it('should mark job as error in database and cache', async () => {
      const jobId = 'test-job-error';
      const errorMessage = 'Generation failed due to API error';

      await progressTracker.errorWithPersistence(jobId, errorMessage);

      // Verify database error function was called
      expect(supabaseServer.rpc).toHaveBeenCalledWith('error_job_progress', {
        job_id: jobId,
        error_message: errorMessage
      });

      // Verify cache was updated
      const cached = progressTracker.get(jobId);
      expect(cached).toBeTruthy();
      expect(cached?.stage).toBe('error');
      expect(cached?.current).toBe(0);
      expect(cached?.total).toBe(0);
      expect(cached?.message).toBe(errorMessage);
    });
  });

  describe('subscriber pattern', () => {
    it('should notify subscribers of progress updates', async () => {
      const jobId = 'test-job-subscribers';
      const callback = jest.fn();

      // Subscribe to updates
      const unsubscribe = progressTracker.subscribe(jobId, callback);

      // Update progress
      await progressTracker.updateWithPersistence(jobId, {
        stage: 'synthesizing',
        current: 75,
        total: 100,
        message: 'Notifying subscribers'
      });

      // Verify callback was called
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'synthesizing',
          current: 75,
          total: 100,
          message: 'Notifying subscribers'
        })
      );

      // Unsubscribe
      unsubscribe();

      // Update again
      await progressTracker.updateWithPersistence(jobId, {
        stage: 'complete',
        current: 100,
        total: 100,
        message: 'Should not notify'
      });

      // Verify callback was not called again
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-cleanup', () => {
    it('should auto-clear completed jobs after timeout', (done) => {
      const jobId = 'test-job-cleanup';
      
      // Mark as complete
      progressTracker.complete(jobId, 'Test complete');

      // Verify job exists initially
      expect(progressTracker.get(jobId)).toBeTruthy();

      // Wait for auto-cleanup (30 seconds + small buffer)
      setTimeout(() => {
        expect(progressTracker.get(jobId)).toBeNull();
        done();
      }, 31000);
    }, 35000); // Increase timeout for this test

    it('should auto-clear error jobs after timeout', (done) => {
      const jobId = 'test-job-error-cleanup';
      
      // Mark as error
      progressTracker.error(jobId, 'Test error');

      // Verify job exists initially
      expect(progressTracker.get(jobId)).toBeTruthy();

      // Wait for auto-cleanup (60 seconds + small buffer)
      setTimeout(() => {
        expect(progressTracker.get(jobId)).toBeNull();
        done();
      }, 61000);
    }, 65000); // Increase timeout for this test
  });

  describe('concurrent updates', () => {
    it('should handle concurrent updates safely', async () => {
      const jobId = 'test-job-concurrent';
      
      // Simulate concurrent updates
      const promises = Array.from({ length: 10 }, (_, i) => 
        progressTracker.updateWithPersistence(jobId, {
          stage: 'synthesizing',
          current: i * 10,
          total: 100,
          message: `Update ${i}`
        })
      );

      await Promise.all(promises);

      // Verify final state is consistent
      const final = progressTracker.get(jobId);
      expect(final).toBeTruthy();
      expect(final?.stage).toBe('synthesizing');
      expect(final?.current).toBeGreaterThanOrEqual(0);
      expect(final?.current).toBeLessThanOrEqual(100);
    });
  });
});
