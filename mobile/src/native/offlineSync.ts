/**
 * Offline-Tolerant Sync Manager for CBT Practice Exams
 * Handles offline question caching and resilient queued answer synchronization.
 */

export interface QueuedAnswer {
  id: string;
  testId: string;
  questionId: string;
  selectedOption: string;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = "cbt_mobile_offline_answer_queue";
const QUESTIONS_CACHE_PREFIX = "cbt_mobile_cached_questions_";

class OfflineSyncManager {
  private isOnlineStatus: boolean = typeof navigator !== "undefined" ? navigator.onLine : true;
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private isSyncing: boolean = false;
  private syncAnswer: ((answer: QueuedAnswer) => Promise<void>) | null = null;

  public setSyncHandler(handler: (answer: QueuedAnswer) => Promise<void>): void {
    this.syncAnswer = handler;
  }

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.isOnlineStatus = true;
        this.notifyListeners();
        this.flushQueue();
      });

      window.addEventListener("offline", () => {
        this.isOnlineStatus = false;
        this.notifyListeners();
      });
    }
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  public subscribe(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isOnlineStatus);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.isOnlineStatus);
    }
  }

  /**
   * Queue exam answer locally when connection is unreliable or offline
   */
  public queueAnswer(testId: string, questionId: string, selectedOption: string): QueuedAnswer {
    const queue = this.getQueue();
    const existingIndex = queue.findIndex(
      (item) => item.testId === testId && item.questionId === questionId
    );

    const queuedItem: QueuedAnswer = {
      id: `${testId}_${questionId}`,
      testId,
      questionId,
      selectedOption,
      timestamp: Date.now(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = queuedItem;
    } else {
      queue.push(queuedItem);
    }

    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn("[OfflineSync] Failed to persist queue to localStorage:", e);
    }

    // Try flushing if online
    if (this.isOnlineStatus && !this.isSyncing) {
      this.flushQueue();
    }

    return queuedItem;
  }

  public getQueue(): QueuedAnswer[] {
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public clearQueueForTest(testId: string): void {
    const queue = this.getQueue().filter((item) => item.testId !== testId);
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Ignore
    }
  }

  /**
   * Synchronize all queued answers once network connectivity is re-established
   */
  public async flushQueue(): Promise<{ synced: number; failed: number }> {
    const queue = this.getQueue();
    const syncAnswer = this.syncAnswer;
    if (queue.length === 0 || this.isSyncing || !this.isOnlineStatus || !syncAnswer) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;
    const acknowledged = new Map<string, number>();

    for (const item of queue) {
      try {
        await syncAnswer(item);
        acknowledged.set(item.id, item.timestamp);
        window.dispatchEvent(
          new CustomEvent("cbt:offline_answer_synced", {
            detail: item,
          })
        );
        synced++;
      } catch (err) {
        console.warn("[OfflineSync] Failed to sync item:", item, err);
        failed++;
      }
    }

    try {
      const remaining = this.getQueue().filter(item => acknowledged.get(item.id) !== item.timestamp);
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // Ignore
    }

    this.isSyncing = false;
    return { synced, failed };
  }

  /**
   * Cache questions locally for a subject
   */
  public cacheQuestions(subject: string, questions: unknown[]): void {
    try {
      const key = `${QUESTIONS_CACHE_PREFIX}${subject.toLowerCase()}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          cachedAt: Date.now(),
          questions,
        })
      );
    } catch (e) {
      console.warn("[OfflineSync] Failed to cache questions for:", subject, e);
    }
  }

  /**
   * Retrieve cached questions for a subject
   */
  public getCachedQuestions<T = unknown>(subject: string): T[] | null {
    try {
      const key = `${QUESTIONS_CACHE_PREFIX}${subject.toLowerCase()}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return parsed.questions || null;
    } catch {
      return null;
    }
  }
}

export const offlineSync = new OfflineSyncManager();
