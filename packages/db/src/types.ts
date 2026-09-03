import type {
  IdentityKey,
  IdentityKeyType,
  IdentityResolutionStatus,
  VerificationStatus,
} from '@shalcon/evidence';
import type { ProspectState } from '@shalcon/state-machine';

export type UtcTimestamp = string;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  createdAt: UtcTimestamp;
}

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  emailAtLink: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: UtcTimestamp;
  createdAt: UtcTimestamp;
  lastSeenAt: UtcTimestamp;
  revokedAt: UtcTimestamp | null;
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
  addressNormalized?: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface SourceRecord {
  id: string;
  prospectId: string;
  provider: string;
  sourceType: string;
  sourceUrl: string;
  rawJson: string;
  capturedAt: UtcTimestamp;
}

export interface EvidenceRecord {
  id: string;
  prospectId: string;
  field: string;
  value: string;
  sourceRecordId: string;
  sourceUrl: string;
  sourceQuality: number;
  confidence: number;
  verificationStatus: VerificationStatus;
  excerpt: string | null;
  capturedAt: UtcTimestamp;
}

export interface ProspectFactRecord {
  id: string;
  prospectId: string;
  field: string;
  value: string;
  verificationStatus: VerificationStatus;
  confidence: number;
  evidenceId: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
}

export interface ProspectIdentityKeyRecord {
  id: string;
  userId: string;
  prospectId: string;
  keyType: IdentityKeyType;
  keyValue: string;
  keyStrength: 'STRONG' | 'WEAK';
  sourceType: string;
  createdAt: UtcTimestamp;
}

export interface ProspectObservationRecord {
  id: string;
  userId: string;
  campaignId: string;
  canonicalProspectId: string | null;
  pendingProspectId: string | null;
  observedName: string;
  normalizedName: string;
  domain: string | null;
  phoneNormalized: string | null;
  city: string | null;
  addressNormalized: string | null;
  sourceType: string;
  resolutionStatus: IdentityResolutionStatus;
  confidence: number;
  candidateProspectIds: string[];
  matchedKeys: IdentityKey[];
  reasonCodes: string[];
  createdAt: UtcTimestamp;
}

export interface IdentityResolutionRecord {
  id: string;
  prospectId: string;
  status: string;
  confidence: number;
  conflictsJson: string;
  evidenceIdsJson: string;
  candidateProspectIdsJson: string;
  matchedKeysJson: string;
  reasonCodesJson: string;
  createdAt: UtcTimestamp;
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
