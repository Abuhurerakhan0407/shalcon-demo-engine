import type { ProspectState } from '@shalcon/state-machine';

export type UtcTimestamp = string;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  createdAt: UtcTimestamp;
}

export interface CampaignRecord {
  id: string;
  userId: string;
  name: string;
  niche: string;
  status: string;
  city: string | null;
  approvalMode: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface ProspectRecord {
  id: string;
  campaignId: string;
  canonicalName: string;
  normalizedName: string;
  niche: string;
  sourceFirstSeen: string;
  currentState: ProspectState;
  domain: string | null;
  phoneNormalized: string | null;
  city: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export const JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRecord {
  id: string;
  jobType: string;
  entityId: string;
  status: JobStatus;
  priority: number;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: UtcTimestamp | null;
  scheduledFor: UtcTimestamp;
  startedAt: UtcTimestamp | null;
  completedAt: UtcTimestamp | null;
  lastErrorCode: string | null;
  lastErrorSafeMessage: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface ProspectStateEventRecord {
  id: number;
  prospectId: string;
  fromState: ProspectState;
  toState: ProspectState;
  occurredAt: UtcTimestamp;
}

export interface AgentRunRecord {
  id: string;
  prospectId: string | null;
  campaignId: string | null;
  demoId: string | null;
  agentName: string;
  agentVersion: string;
  promptVersion: string | null;
  model: string | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  inputJson: string;
  outputJson: string | null;
  startedAt: UtcTimestamp;
  completedAt: UtcTimestamp | null;
  errorCode: string | null;
  safeError: string | null;
}
