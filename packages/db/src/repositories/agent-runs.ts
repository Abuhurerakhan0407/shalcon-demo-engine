import type { D1DatabaseLike } from '../d1';
import type { AgentRunRecord } from '../types';

interface AgentRunRow {
  id: string;
  prospect_id: string | null;
  campaign_id: string | null;
  demo_id: string | null;
  agent_name: string;
  agent_version: string;
  prompt_version: string | null;
  model: string | null;
  status: AgentRunRecord['status'];
  input_json: string;
  output_json: string | null;
  started_at: string;
  completed_at: string | null;
  error_code: string | null;
  safe_error: string | null;
}

function mapAgentRun(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    campaignId: row.campaign_id,
    demoId: row.demo_id,
    agentName: row.agent_name,
    agentVersion: row.agent_version,
    promptVersion: row.prompt_version,
    model: row.model,
    status: row.status,
    inputJson: row.input_json,
    outputJson: row.output_json,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    safeError: row.safe_error,
  };
}

export class AgentRunRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: AgentRunRecord): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO agent_runs(
          id, prospect_id, campaign_id, demo_id, agent_name, agent_version, prompt_version,
          model, status, input_json, output_json, started_at, completed_at, error_code, safe_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        record.id,
        record.prospectId,
        record.campaignId,
        record.demoId,
        record.agentName,
        record.agentVersion,
        record.promptVersion,
        record.model,
        record.status,
        record.inputJson,
        record.outputJson,
        record.startedAt,
        record.completedAt,
        record.errorCode,
        record.safeError,
      )
      .run();
  }

  async getById(id: string): Promise<AgentRunRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM agent_runs WHERE id = ?')
      .bind(id)
      .first<AgentRunRow>();
    return row ? mapAgentRun(row) : null;
  }

  async complete(id: string, outputJson: string, now: string): Promise<AgentRunRecord> {
    await this.db
      .prepare(`
        UPDATE agent_runs
        SET status = 'COMPLETED', output_json = ?, completed_at = ?, error_code = NULL, safe_error = NULL
        WHERE id = ? AND status IN ('PENDING', 'RUNNING')
      `)
      .bind(outputJson, now, id)
      .run();
    const run = await this.getById(id);
    if (!run) throw new Error(`Agent run ${id} was not found after completion.`);
    return run;
  }
}
