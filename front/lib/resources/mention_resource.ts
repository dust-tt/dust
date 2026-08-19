import type { Authenticator } from "@app/lib/auth";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { QueryTypes } from "sequelize";

/** One agent, with the two dates the archival rules compare against a cutoff. */
export interface AgentIdleRow {
  agentId: string;
  createdAt: Date;
  lastMentionedAt: Date | null;
}

// Narrowed rather than asserted, per [GEN4]. A row that fails is dropped, costing a missed candidate
// rather than a malformed one.
function isAgentIdleRow(row: unknown): row is AgentIdleRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }

  if (
    !("agentId" in row) ||
    !("createdAt" in row) ||
    !("lastMentionedAt" in row)
  ) {
    return false;
  }

  return (
    typeof row.agentId === "string" &&
    row.createdAt instanceof Date &&
    (row.lastMentionedAt === null || row.lastMentionedAt instanceof Date)
  );
}

// Driven by the agents, with mentions as an anti-join: the set is defined by absence, and an agent
// nobody ever mentioned has no row here to select. Hand-written because the query builder cannot
// express an anti-join against an aggregate over another table.
const AGENTS_NOT_MENTIONED_SINCE_QUERY = `
  SELECT
    agent."sId" AS "agentId",
    first_version."createdAt" AS "createdAt",
    last_mention."lastMentionedAt" AS "lastMentionedAt"
  FROM agent_configurations agent
  JOIN LATERAL (
    SELECT MIN(version_row."createdAt") AS "createdAt"
    FROM agent_configurations version_row
    WHERE version_row."workspaceId" = agent."workspaceId"
      AND version_row."sId" = agent."sId"
  ) first_version ON true
  LEFT JOIN LATERAL (
    SELECT MAX(mention."createdAt") AS "lastMentionedAt"
    FROM mentions mention
    WHERE mention."workspaceId" = agent."workspaceId"
      AND mention."agentConfigurationId" = agent."sId"
  ) last_mention ON true
  WHERE agent."workspaceId" = $workspaceId
    AND agent.status = 'active'
    AND first_version."createdAt" < $notMentionedSince
    AND ($cursor::text IS NULL OR agent."sId" > $cursor)
    AND (
      last_mention."lastMentionedAt" IS NULL
      OR last_mention."lastMentionedAt" < $notMentionedSince
    )
  ORDER BY agent."sId"
  LIMIT $limit
`;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MentionResource extends ReadonlyAttributesType<MentionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MentionResource extends BaseResource<MentionModel> {
  static model: ModelStatic<MentionModel> = MentionModel;

  constructor(
    model: ModelStatic<MentionModel>,
    blob: Attributes<MentionModel>
  ) {
    super(MentionModel, blob);
  }

  static async makeNew(
    blob: CreationAttributes<MentionModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<MentionResource> {
    const mention = await this.model.create(blob, { transaction });

    return new this(this.model, mention.get());
  }

  /**
   * The workspace's active agents not mentioned since `notMentionedSince`, keyed from `cursor`, with
   * when each was last mentioned. Every mention counts whatever its `status` or `dismissed` flag —
   * somebody reached for the agent.
   *
   * Also filters on `status = 'active'` (which leaves exactly one row per logical agent) and on the
   * agent having first appeared before the cutoff. Both stay *broader or equal* to the rules in
   * `lib/api/assistant/inactivity/policy.ts`, which remain the authority.
   */
  static async listAgentsNotMentionedSince(
    auth: Authenticator,
    {
      notMentionedSince,
      cursor,
      limit,
    }: {
      notMentionedSince: Date;
      cursor: string | null;
      limit: number;
    }
  ): Promise<AgentIdleRow[]> {
    // biome-ignore lint/plugin/noRawSql: an anti-join the query builder cannot express, see above.
    const rows: unknown[] = await frontSequelize.query(
      AGENTS_NOT_MENTIONED_SINCE_QUERY,
      {
        type: QueryTypes.SELECT,
        bind: {
          workspaceId: auth.getNonNullableWorkspace().id,
          notMentionedSince,
          cursor,
          limit,
        },
      }
    );

    return rows.filter(isAgentIdleRow);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await MentionModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<MentionModel>,
      transaction,
    });

    return new Ok(deletedCount);
  }
}
