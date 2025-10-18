/**
 * Real-time Progress Tracking System
 * Replaces simulated progress with actual task updates
 * Now includes database persistence for cross-tab/session support
 */

import { supabaseServer } from './supabase-server';

export type ProgressStage =
  | 'initializing'
  | 'clustering'
  | 'synthesizing'
  | 'deduplicating'
  | 'building_blocks'
  | 'building_nodes'
  | 'complete'
  | 'error';

export interface ProgressUpdate {
  stage: ProgressStage;
  current: number;
  total: number;
  message: string;
  timestamp: number;
  details?: Record<string, any>;
}

class ProgressTracker {
  private updates: Map<string, ProgressUpdate> = new Map();
  private subscribers: Map<string, Set<(progress: ProgressUpdate) => void>> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the progress tracker by loading active jobs from database
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load active jobs from database
      const { data: activeJobs, error } = await supabaseServer
        .from('jobs')
        .select('id, progress_stage, progress_current, progress_total, progress_message, progress_updated_at')
        .in('status', ['pending', 'running'])
        .not('progress_stage', 'is', null);

      if (error) {
        console.error('[PROGRESS_TRACKER] Failed to load active jobs:', error);
        return;
      }

      // Populate in-memory cache with active jobs
      if (activeJobs) {
        for (const job of activeJobs) {
          const progress: ProgressUpdate = {
            stage: job.progress_stage as ProgressStage,
            current: job.progress_current || 0,
            total: job.progress_total || 0,
            message: job.progress_message || '',
            timestamp: new Date(job.progress_updated_at).getTime(),
          };
          this.updates.set(job.id, progress);
        }
        console.log(`[PROGRESS_TRACKER] Loaded ${activeJobs.length} active jobs from database`);
      }

      this.initialized = true;
    } catch (error) {
      console.error('[PROGRESS_TRACKER] Initialization error:', error);
      this.initialized = true; // Continue even if initialization fails
    }
  }

  /**
   * Update progress for a specific job (in-memory only, for backwards compatibility)
   */
  update(jobId: string, progress: Omit<ProgressUpdate, 'timestamp'>): void {
    const fullProgress: ProgressUpdate = {
      ...progress,
      timestamp: Date.now(),
    };

    this.updates.set(jobId, fullProgress);

    // Notify subscribers
    const callbacks = this.subscribers.get(jobId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(fullProgress);
        } catch (error) {
          console.error('[PROGRESS_TRACKER] Subscriber callback error:', error);
        }
      });
    }

    console.log(`[PROGRESS_TRACKER] ${jobId}: ${progress.stage} - ${progress.message} (${progress.current}/${progress.total})`);
  }

  /**
   * Update progress with database persistence
   */
  async updateWithPersistence(jobId: string, progress: Omit<ProgressUpdate, 'timestamp'>): Promise<void> {
    const fullProgress: ProgressUpdate = {
      ...progress,
      timestamp: Date.now(),
    };

    try {
      // Update database using the atomic function
      const { data, error } = await supabaseServer.rpc('update_job_progress', {
        job_id: jobId,
        stage: progress.stage,
        current_step: progress.current,
        total_steps: progress.total,
        message: progress.message
      });

      if (error) {
        console.error('[PROGRESS_TRACKER] Database update failed:', error);
        // Continue with in-memory update even if DB fails
      } else {
        console.log(`[PROGRESS_TRACKER] Database updated for ${jobId}`);
      }
    } catch (error) {
      console.error('[PROGRESS_TRACKER] Database update error:', error);
      // Continue with in-memory update even if DB fails
    }

    // Update in-memory cache
    this.updates.set(jobId, fullProgress);

    // Notify subscribers
    const callbacks = this.subscribers.get(jobId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(fullProgress);
        } catch (error) {
          console.error('[PROGRESS_TRACKER] Subscriber callback error:', error);
        }
      });
    }

    console.log(`[PROGRESS_TRACKER] ${jobId}: ${progress.stage} - ${progress.message} (${progress.current}/${progress.total})`);
  }

  /**
   * Get current progress for a job (in-memory only, for backwards compatibility)
   */
  get(jobId: string): ProgressUpdate | null {
    return this.updates.get(jobId) || null;
  }

  /**
   * Get current progress with database fallback
   */
  async getWithFallback(jobId: string): Promise<ProgressUpdate | null> {
    // Check in-memory cache first
    const cached = this.updates.get(jobId);
    if (cached) {
      return cached;
    }

    // Initialize if not done yet
    await this.initialize();

    // Check cache again after initialization
    const cachedAfterInit = this.updates.get(jobId);
    if (cachedAfterInit) {
      return cachedAfterInit;
    }

    // Fallback to database query
    try {
      const { data: job, error } = await supabaseServer
        .from('jobs')
        .select('progress_stage, progress_current, progress_total, progress_message, progress_updated_at')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        return null;
      }

      const progress: ProgressUpdate = {
        stage: job.progress_stage as ProgressStage,
        current: job.progress_current || 0,
        total: job.progress_total || 0,
        message: job.progress_message || '',
        timestamp: new Date(job.progress_updated_at).getTime(),
      };

      // Cache the result
      this.updates.set(jobId, progress);
      return progress;
    } catch (error) {
      console.error('[PROGRESS_TRACKER] Database query error:', error);
      return null;
    }
  }

  /**
   * Subscribe to progress updates for a job
   */
  subscribe(jobId: string, callback: (progress: ProgressUpdate) => void): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }

    this.subscribers.get(jobId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(jobId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  /**
   * Clear progress data for a job (cleanup after completion)
   */
  clear(jobId: string): void {
    this.updates.delete(jobId);
    this.subscribers.delete(jobId);
  }

  /**
   * Mark a job as complete (in-memory only, for backwards compatibility)
   */
  complete(jobId: string, message: string = 'Complete'): void {
    this.update(jobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message,
    });
    
    // Keep the completion status for 30 seconds to allow UI to detect it
    // Then auto-clear to prevent memory buildup
    setTimeout(() => {
      console.log(`[PROGRESS_TRACKER] Auto-clearing completed job: ${jobId}`);
      this.clear(jobId);
    }, 30000); // 30 seconds
  }

  /**
   * Mark a job as complete with database persistence
   */
  async completeWithPersistence(jobId: string, message: string = 'Complete'): Promise<void> {
    try {
      // Update database using the complete function
      const { data, error } = await supabaseServer.rpc('complete_job_progress', {
        job_id: jobId,
        message: message
      });

      if (error) {
        console.error('[PROGRESS_TRACKER] Database complete failed:', error);
        // Continue with in-memory update even if DB fails
      } else {
        console.log(`[PROGRESS_TRACKER] Database marked complete for ${jobId}`);
      }
    } catch (error) {
      console.error('[PROGRESS_TRACKER] Database complete error:', error);
      // Continue with in-memory update even if DB fails
    }

    // Update in-memory cache
    this.update(jobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message,
    });
    
    // Keep the completion status for 30 seconds to allow UI to detect it
    // Then auto-clear to prevent memory buildup
    setTimeout(() => {
      console.log(`[PROGRESS_TRACKER] Auto-clearing completed job: ${jobId}`);
      this.clear(jobId);
    }, 30000); // 30 seconds
  }

  /**
   * Mark a job as failed (in-memory only, for backwards compatibility)
   */
  error(jobId: string, errorMessage: string): void {
    this.update(jobId, {
      stage: 'error',
      current: 0,
      total: 0,
      message: errorMessage,
    });
    
    // Keep the error status for 60 seconds to allow UI to detect and display it
    setTimeout(() => {
      console.log(`[PROGRESS_TRACKER] Auto-clearing error job: ${jobId}`);
      this.clear(jobId);
    }, 60000); // 60 seconds for errors
  }

  /**
   * Mark a job as failed with database persistence
   */
  async errorWithPersistence(jobId: string, errorMessage: string): Promise<void> {
    try {
      // Update database using the error function
      const { data, error } = await supabaseServer.rpc('error_job_progress', {
        job_id: jobId,
        error_message: errorMessage
      });

      if (error) {
        console.error('[PROGRESS_TRACKER] Database error update failed:', error);
        // Continue with in-memory update even if DB fails
      } else {
        console.log(`[PROGRESS_TRACKER] Database marked error for ${jobId}`);
      }
    } catch (error) {
      console.error('[PROGRESS_TRACKER] Database error update error:', error);
      // Continue with in-memory update even if DB fails
    }

    // Update in-memory cache
    this.update(jobId, {
      stage: 'error',
      current: 0,
      total: 0,
      message: errorMessage,
    });
    
    // Keep the error status for 60 seconds to allow UI to detect and display it
    setTimeout(() => {
      console.log(`[PROGRESS_TRACKER] Auto-clearing error job: ${jobId}`);
      this.clear(jobId);
    }, 60000); // 60 seconds for errors
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();

