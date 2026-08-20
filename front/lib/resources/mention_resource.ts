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

/** One agent and when it was last mentioned, null if it never was. */
export interface AgentIdleRow {
  agentId: string;
  lastMentionedAt: Date | null;
}

// Narrowed rather than asserted, per [GEN4]. A row that fails is dropped, costing a missed candidate
// rather than a malformed one.
function isAgentIdleRow(row: unknown): row is AgentIdleRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }

  if (!("agentId" in row) || !("lastMentionedAt" in row)) {
    return false;
  }

  return (
    typeof row.agentId === "string" &&
    (row.lastMentionedAt === null || row.lastMentionedAt instanceof Date)
  );
}

// Driven by the agents, with mentions as an anti-join: the set is defined by absence, and an agent
// nobody ever mentioned has no row here to select. The LATERAL reads one row per agent — the newest
// mention — instead of every mention of every agent.
const AGENTS_NOT_MENTIONED_SINCE_QUERY = `
  SELECT
    agent."sId" AS "agentId",
    last_mention."lastMentionedAt" AS "lastMentionedAt"
  FROM agent_configurations agent
  LEFT JOIN LATERAL (
    SELECT MAX(mention."createdAt") AS "lastMentionedAt"
    FROM mentions mention
    WHERE mention."workspaceId" = agent."workspaceId"
      AND mention."agentConfigurationId" = agent."sId"
  ) last_mention ON true
  WHERE agent."workspaceId" = $workspaceId
    AND agent.status = 'active'
    AND (
      last_mention."lastMentionedAt" IS NULL
      OR last_mention."lastMentionedAt" < $notMentionedSince
    )
  ORDER BY agent."sId"
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
   * The workspace's active agents not mentioned since `notMentionedSince`, with when each last was.
   *
   * Global agents cannot appear: they have no row in `agent_configurations`, which is what stops a
   * workspace policy from archiving one. Every mention counts, whatever its status.
   */
  static async listAgentsNotMentionedSince(
    auth: Authenticator,
    { notMentionedSince }: { notMentionedSince: Date }
  ): Promise<AgentIdleRow[]> {
    // biome-ignore lint/plugin/noRawSql: needs a LATERAL, which the query builder cannot express.
    const rows: unknown[] = await frontSequelize.query(
      AGENTS_NOT_MENTIONED_SINCE_QUERY,
      {
        type: QueryTypes.SELECT,
        bind: {
          workspaceId: auth.getNonNullableWorkspace().id,
          notMentionedSince,
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
