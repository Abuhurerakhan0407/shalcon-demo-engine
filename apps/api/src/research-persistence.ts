import {
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
  type JobRecord,
  type SourceRecord,
} from '@shalcon/db';

import {
  parseResearchResultForJob,
  researchPageRawJson,
  researchSourceId,
} from './research-result';

export interface ResearchPersistenceResult {
  sourceCount: number;
  sourceIds: string[];
}

export async function persistResearchSourcesIfNeeded(
  db: D1DatabaseLike,
  userId: string,
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
    const record: SourceRecord = {
      id: await researchSourceId(job.id, prospect.id, page.finalUrl),
      prospectId: prospect.id,
      provider: 'PLAYWRIGHT',
      sourceType: 'WEBSITE_PAGE',
      sourceUrl: page.finalUrl,
      rawJson: researchPageRawJson(result, page),
      capturedAt: page.capturedAt,
    };
    const stored = await sources.createOrGet(record);
    persisted.push(stored.source);
  }

  return {
    sourceCount: persisted.length,
    sourceIds: persisted.map((source) => source.id),
  };
}
