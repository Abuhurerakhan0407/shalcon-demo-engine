import { describe, expect, it } from 'vitest';

import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from '../d1';
import { RunnerJobRepository } from './runner-jobs';

class CaptureDb implements D1DatabaseLike {
  lastQuery: string | null = null;
  lastBindings: unknown[] | null = null;
  prepareCount = 0;

  prepare(query: string): D1PreparedStatementLike {
    this.prepareCount += 1;
    const db = this;
    let bindings: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        bindings = values;
        return this;
      },
      first<T = Record<string, unknown>>(): Promise<T | null> {
        db.lastQuery = query;
        db.lastBindings = bindings;
        return Promise.resolve(null);
      },
      all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
        db.lastQuery = query;
        db.lastBindings = bindings;
        return Promise.resolve({ results: [], success: true });
      },
      run(): Promise<D1ResultLike> {
        db.lastQuery = query;
        db.lastBindings = bindings;
        return Promise.resolve({ success: true, meta: { changes: 0 } });
      },
    };
  }

  batch(): Promise<D1ResultLike[]> {
    return Promise.resolve([]);
  }
}

describe('RunnerJobRepository capability filtering', () => {
  it('filters due jobs to the runner advertised job types using bound SQL values', async () => {
    const db = new CaptureDb();
    const jobs = new RunnerJobRepository(db);

    const due = await jobs.dueForSignal(
      'operator-1',
      '2026-09-04T00:00:00.000Z',
      25,
      ['PLAYWRIGHT_RESEARCH', 'PHASE8_ECHO', 'PLAYWRIGHT_RESEARCH'],
    );

    expect(due).toEqual([]);
    expect(db.lastQuery).toContain('j.job_type IN (?, ?)');
    expect(db.lastBindings).toEqual([
      'operator-1',
      '2026-09-04T00:00:00.000Z',
      'PLAYWRIGHT_RESEARCH',
      'PHASE8_ECHO',
      25,
    ]);
  });

  it('does not query or claim any job when the runner advertises no capabilities', async () => {
    const db = new CaptureDb();
    const jobs = new RunnerJobRepository(db);

    const due = await jobs.dueForSignal(
      'operator-1',
      '2026-09-04T00:00:00.000Z',
      25,
      [],
    );

    expect(due).toEqual([]);
    expect(db.prepareCount).toBe(0);
    expect(db.lastQuery).toBeNull();
  });
});
