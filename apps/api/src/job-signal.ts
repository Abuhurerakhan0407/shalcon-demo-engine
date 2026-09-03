import type { JobSignalQueueLike } from './context';

export interface JobSignalMessage {
  jobId: string;
  userId: string;
  jobType: string;
}

export type JobSignalResult = 'SIGNALLED' | 'D1_ONLY';

export async function signalJob(
  queue: JobSignalQueueLike | undefined,
  message: JobSignalMessage,
): Promise<JobSignalResult> {
  if (!queue) return 'D1_ONLY';
  try {
    await queue.send(message);
    return 'SIGNALLED';
  } catch {
    // D1 is canonical. A signal failure must never erase or fail an accepted job.
    return 'D1_ONLY';
  }
}
