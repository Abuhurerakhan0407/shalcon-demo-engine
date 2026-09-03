import {
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
  type JobRecord,
  type SourceRecord,
} from '@shalcon/db';

import {
  canonicalResearchUrl,
  parseResearchResultForJob,
  researchPageRawJson,
  researchSourceId,
} from './research-result';

export interface ResearchPersistenceResult {
  sourceCount: number;
  sourceIds: string[];
}

export class ResearchLeaseLostError extends Error {
  constructor() {
    super('Research source persistence requires an active runner lease.');
    this.name = 'ResearchLeaseLostError';
  }
}

export async function persistResearchSourcesIfNeeded(
  db: D1DatabaseLike,
  userId: string,
  runnerId: string,
  job: JobRecord,
  rawResult: unknown,
  expectedRequestedUrl?: string,
): Promise<ResearchPersistenceResult | null> {
  if (job.jobType !== 'PLAYWRIGHT_RESEARCH') return null;

  const prospect = await new ProspectRepository(db).getByIdForUser(job.entityId, userId);
  if (!prospect) {
    throw new Error('Research prospect is unavailable to this operator.');
  }

  const result = parseResearchResultForJob(
    rawResult,
    job.id,
    prospect.id,
    expectedRequestedUrl,
  );
  const sources = new SourceRecordRepository(db);
  const persisted: SourceRecord[] = [];

  for (const page of result.pages) {
    const sourceUrl = canonicalResearchUrl(page.finalUrl);
    if (!sourceUrl) throw new Error('Research source URL failed canonical validation.');

    const record: SourceRecord = {
      id: await researchSourceId(job.id, prospect.id, sourceUrl),
      prospectId: prospect.id,
      provider: 'PLAYWRIGHT',
      sourceType: 'WEBSITE_PAGE',
      sourceUrl,
      rawJson: researchPageRawJson(result, page),
      capturedAt: page.capturedAt,
    };
    const stored = await sources.createOrGetForActiveLease(record, {
      jobId: job.id,
      userId,
      runnerId,
      now: new Date().toISOString(),
    });
    if (!stored) throw new ResearchLeaseLostError();
    persisted.push(stored.source);
  }

  return {
    sourceCount: persisted.length,
    sourceIds: persisted.map((source) => source.id),
  };
}
