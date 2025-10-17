/**
 * Real-time Progress Tracking System
 * Replaces simulated progress with actual task updates
 */

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

  /**
   * Update progress for a specific job
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
   * Get current progress for a job
   */
  get(jobId: string): ProgressUpdate | null {
    return this.updates.get(jobId) || null;
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
   * Mark a job as complete
   */
  complete(jobId: string, message: string = 'Complete'): void {
    this.update(jobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message,
    });
  }

  /**
   * Mark a job as failed
   */
  error(jobId: string, errorMessage: string): void {
    this.update(jobId, {
      stage: 'error',
      current: 0,
      total: 0,
      message: errorMessage,
    });
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();

