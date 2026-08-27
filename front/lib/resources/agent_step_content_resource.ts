import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { CachedAgentStepContent } from "@app/lib/resources/agent_step_content/cache";
import {
  tryHydrateAgentStepContentsFromCache,
  warmAgentStepContentCacheMany,
} from "@app/lib/resources/agent_step_content/cache";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type {
  AgentFunctionCallContentType,
  AgentStepContentType,
} from "@app/types/assistant/agent_message_content";
import { isAgentFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import chunk from "lodash/chunk";
import groupBy from "lodash/groupBy";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, Sequelize } from "sequelize";

export const FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE = 512;

// DO NOT INCREASE THIS BLINDLY, instead you can first try
// to bump up FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE
// value = max peak concurrency - 1
const FETCH_BY_AGENT_MESSAGES_CONCURRENCY = 4;

const METADATA_ATTRIBUTES = [
  "id",
  "createdAt",
  "updatedAt",
  "workspaceId",
  "agentMessageId",
  "step",
  "index",
  "version",
  "type",
  "dustRunId",
] as const;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentStepContentResource
  extends ReadonlyAttributesType<AgentStepContentModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentStepContentResource extends BaseResource<AgentStepContentModel> {
  static model: ModelStaticWorkspaceAware<AgentStepContentModel> =
    AgentStepContentModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentStepContentModel>,
    blob: Attributes<AgentStepContentModel> & {
      agentMCPActions?: AgentMCPActionModel[];
    }
  ) {
    super(AgentStepContentModel, blob);
  }

  /**
   * Helper function to check if the user can read the agent message
   * and fetch the agent configuration.
   */
  private static async checkAgentMessageAccess(
    auth: Authenticator,
    agentMessageIds: ModelId[]
  ): Promise<ModelId[]> {
    const uniqueAgentMessageIds = [...new Set(agentMessageIds)];

    if (uniqueAgentMessageIds.length === 0) {
      return [];
    }

    const agentMessages = await AgentMessageModel.findAll({
      attributes: ["id", "agentConfigurationId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: {
          [Op.any]: Sequelize.literal("$agentMessageIds::bigint[]"),
        },
      },
      bind: {
        agentMessageIds: uniqueAgentMessageIds,
      },
    });

    assert(
      agentMessages.length === uniqueAgentMessageIds.length,
      "Unexpected: missing agent messages"
    );

    const uniqueAgentIds = [
      ...new Set(agentMessages.map((a) => a.agentConfigurationId)),
    ];
    // Fetch agent configuration to check permissions
    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds: uniqueAgentIds,
      variant: "extra_light",
    });

    if (agentConfigurations.length !== uniqueAgentIds.length) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentIds: uniqueAgentIds,
          found: agentConfigurations.map((a) => a.sId),
        },
        "User does not have access to agents"
      );
    }

    const allowedAgentIds = new Set(agentConfigurations.map((a) => a.sId));
    return agentMessages
      .filter((a) => allowedAgentIds.has(a.agentConfigurationId))
      .map((a) => a.id);
  }

  public static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<AgentStepContentResource[]> {
    const contents = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: { [Op.in]: ids },
      },
    });

    return contents.map((content) => new this(this.model, content.get()));
  }

  public static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<AgentStepContentResource | null> {
    const stepContents = await this.fetchByModelIds(auth, [id]);

    return stepContents[0] ?? null;
  }

  /**
   * Helper to filter latest versions from fetched content.
   * Contents must already be ordered by version DESC within each group.
   */
  private static filterLatestVersions<
    T extends {
      agentMessageId: ModelId;
      step: number;
      index: number;
    },
  >(contents: T[], groupByFields: (keyof T)[]): T[] {
    const grouped = groupBy(contents, (content) =>
      groupByFields.map((field) => content[field]).join("-")
    );

    // For each group, keep only the first item (already sorted by version DESC)
    return Object.values(grouped).map((group) => group[0]);
  }

  private static fromCached(
    cached: CachedAgentStepContent
  ): AgentStepContentResource {
    return new AgentStepContentResource(this.model, {
      id: cached.id,
      workspaceId: cached.workspaceId,
      agentMessageId: cached.agentMessageId,
      step: cached.step,
      index: cached.index,
      version: cached.version,
      type: cached.type,
      value: cached.value,
      dustRunId: cached.dustRunId,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
    });
  }

  // Serialize into the Redis cache shape. Inverse of `fromCached`.
  private toCachedJSON(): CachedAgentStepContent {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      agentMessageId: this.agentMessageId,
      step: this.step,
      index: this.index,
      version: this.version,
      type: this.type,
      value: this.value,
      dustRunId: this.dustRunId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  private static async fetchByAgentMessagesFromPostgres(
    auth: Authenticator,
    {
      agentMessageIds,
      step,
      transaction,
      textContentOnly = false,
    }: {
      agentMessageIds: ModelId[];
      step?: number;
      transaction?: Transaction;
      textContentOnly?: boolean;
    }
  ): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    if (agentMessageIds.length === 0) {
      return [];
    }

    const chunks = chunk(agentMessageIds, FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE);

    const batchResults = await concurrentExecutor(
      chunks,
      async (idsChunk) =>
        this.model.findAll({
          where: {
            workspaceId: owner.id,
            ...(textContentOnly ? { type: "text_content" } : {}),
            ...(step !== undefined ? { step } : {}),
            agentMessageId: {
              [Op.any]: Sequelize.literal("$agentMessageIds::bigint[]"),
            },
          },
          order: [
            ["step", "ASC"],
            ["index", "ASC"],
            ["version", "DESC"],
          ],
          bind: {
            agentMessageIds: idsChunk,
          },
          transaction,
        }),
      {
        concurrency: transaction ? 1 : FETCH_BY_AGENT_MESSAGES_CONCURRENCY,
      }
    );

    let contents = batchResults.flat();

    // We only care about the latest version of the step content for each agent message, step, and index.
    contents = this.filterLatestVersions(contents, [
      "agentMessageId",
      "step",
      "index",
    ]);

    return contents.map(
      (content) => new AgentStepContentResource(this.model, content.get())
    );
  }

  /**
   * Cheap metadata-only fetch (no TOAST de-toast of `value`) used to check
   * Redis Hash completeness before hydrating from cache.
   */
  private static async fetchLatestMetadataByAgentMessages(
    auth: Authenticator,
    {
      agentMessageIds,
      textContentOnly = false,
    }: {
      agentMessageIds: ModelId[];
      textContentOnly?: boolean;
    }
  ): Promise<
    Array<{
      id: ModelId;
      agentMessageId: ModelId;
      step: number;
      index: number;
      version: number;
      type: AgentStepContentModel["type"];
      dustRunId: string | null;
    }>
  > {
    const owner = auth.getNonNullableWorkspace();
    const chunks = chunk(agentMessageIds, FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE);

    const batchResults = await concurrentExecutor(
      chunks,
      async (idsChunk) =>
        this.model.findAll({
          attributes: [...METADATA_ATTRIBUTES],
          where: {
            workspaceId: owner.id,
            ...(textContentOnly ? { type: "text_content" } : {}),
            agentMessageId: {
              [Op.any]: Sequelize.literal("$agentMessageIds::bigint[]"),
            },
          },
          order: [
            ["step", "ASC"],
            ["index", "ASC"],
            ["version", "DESC"],
          ],
          bind: {
            agentMessageIds: idsChunk,
          },
        }),
      { concurrency: FETCH_BY_AGENT_MESSAGES_CONCURRENCY }
    );

    return this.filterLatestVersions(batchResults.flat(), [
      "agentMessageId",
      "step",
      "index",
    ]).map((row) => ({
      id: row.id,
      agentMessageId: row.agentMessageId,
      step: row.step,
      index: row.index,
      version: row.version,
      type: row.type,
      dustRunId: row.dustRunId,
    }));
  }

  static async fetchByAgentMessages(
    auth: Authenticator,
    {
      agentMessageIds,
      transaction,
      textContentOnly = false,
    }: {
      agentMessageIds: ModelId[];
      transaction?: Transaction;
      textContentOnly?: boolean;
    }
  ): Promise<AgentStepContentResource[]> {
    if (agentMessageIds.length === 0) {
      return [];
    }

    // Skip cache inside a transaction: Redis is not transactional with PG, and
    // callers may be reading uncommitted rows.
    if (transaction) {
      return this.fetchByAgentMessagesFromPostgres(auth, {
        agentMessageIds,
        transaction,
        textContentOnly,
      });
    }

    const owner = auth.getNonNullableWorkspace();

    const latestMetadata = await this.fetchLatestMetadataByAgentMessages(auth, {
      agentMessageIds,
      textContentOnly,
    });

    const cacheResult = await tryHydrateAgentStepContentsFromCache({
      workspaceId: owner.id,
      agentMessageIds,
      latestMetadata,
    });

    if (!cacheResult) {
      getStatsDClient().increment(
        "agent_step_content.fetch.count",
        agentMessageIds.length,
        ["source:postgres", "cache:error"]
      );
      return this.fetchByAgentMessagesFromPostgres(auth, {
        agentMessageIds,
        textContentOnly,
      });
    }

    const { hitsByAgentMessageId, missAgentMessageIds } = cacheResult;

    getStatsDClient().increment(
      "agent_step_content.fetch.count",
      hitsByAgentMessageId.size,
      ["source:cache"]
    );
    getStatsDClient().increment(
      "agent_step_content.fetch.count",
      missAgentMessageIds.length,
      ["source:postgres"]
    );

    const hitResources = [...hitsByAgentMessageId.values()].flatMap((cached) =>
      cached.map((c) => this.fromCached(c))
    );

    if (missAgentMessageIds.length === 0) {
      return hitResources.toSorted(
        (a, b) =>
          a.agentMessageId - b.agentMessageId ||
          a.step - b.step ||
          a.index - b.index
      );
    }

    const missResources = await this.fetchByAgentMessagesFromPostgres(auth, {
      agentMessageIds: missAgentMessageIds,
      textContentOnly,
    });

    // Re-warm so the next fetch within the TTL can skip TOAST.
    void warmAgentStepContentCacheMany(
      missResources.map((r) => r.toCachedJSON())
    );

    return [...hitResources, ...missResources].toSorted(
      (a, b) =>
        a.agentMessageId - b.agentMessageId ||
        a.step - b.step ||
        a.index - b.index
    );
  }

  /**
   * Fetches one completed step without hydrating the whole-message cache.
   */
  static async fetchByAgentMessageModelIdsAtStep(
    auth: Authenticator,
    {
      agentMessageModelIds,
      step,
      textContentOnly = false,
    }: {
      agentMessageModelIds: ModelId[];
      step: number;
      textContentOnly?: boolean;
    }
  ): Promise<AgentStepContentResource[]> {
    return this.fetchByAgentMessagesFromPostgres(auth, {
      agentMessageIds: agentMessageModelIds,
      step,
      textContentOnly,
    });
  }

  /**
   * Fetches the canonical function calls for each agent message.
   *
   * Filtering happens after resolving the latest row for each step and index so function calls
   * from superseded Temporal attempts cannot reappear in rendered context.
   */
  static async fetchLatestFunctionCallsByAgentMessageModelIds(
    auth: Authenticator,
    agentMessageModelIds: ModelId[]
  ): Promise<AgentStepContentResource[]> {
    const latestMetadata = await this.fetchLatestMetadataByAgentMessages(auth, {
      agentMessageIds: agentMessageModelIds,
    });
    const functionCallModelIds = latestMetadata
      .filter(({ type }) => type === "function_call")
      .map(({ id }) => id);

    return this.fetchByModelIds(auth, functionCallModelIds);
  }

  isFunctionCallContent(): this is AgentStepContentResource & {
    value: AgentFunctionCallContentType;
  } {
    return isAgentFunctionCallContent(this.value);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    if (this.workspaceId !== owner.id) {
      return new Err(
        new Error("Cannot delete agent step content from another workspace")
      );
    }

    const allowedAgentMessageIds =
      await AgentStepContentResource.checkAgentMessageAccess(auth, [
        this.agentMessageId,
      ]);

    if (allowedAgentMessageIds.length === 0) {
      return new Err(new Error("User does not have access to agents"));
    }

    const deletedCount = await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: owner.id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  static async deleteByAgentMessageIds(
    auth: Authenticator,
    { agentMessageIds }: { agentMessageIds: ModelId[] }
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: { [Op.in]: agentMessageIds },
      },
    });
  }

  toJSON(): AgentStepContentType {
    let value = this.value;
    if (this.type === "reasoning" && value.type === "reasoning") {
      value = {
        ...value,
        value: {
          ...value.value,
          // TODO(DURABLE-AGENTS 2025-07-16): remove defaults once backfill is done.
          tokens: value.value.tokens ?? 0,
          provider: value.value.provider ?? "openai",
        },
      };
    }

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      agentMessageId: this.agentMessageId,
      step: this.step,
      index: this.index,
      version: this.version,
      type: this.type,
      value,
    };
  }

  static async createNewVersion(
    blob: Omit<CreationAttributes<AgentStepContentModel>, "version">
  ): Promise<AgentStepContentResource> {
    const [resource] = await this.createNewVersions([blob]);
    return resource;
  }

  /**
   * Bulk-insert step contents with correct per-(step, index) versioning
   * (one version lookup + one INSERT). Prefer this over looping
   * `createNewVersion` when persisting multiple contents for a step.
   */
  static async createNewVersions(
    blobs: Omit<CreationAttributes<AgentStepContentModel>, "version">[]
  ): Promise<AgentStepContentResource[]> {
    if (blobs.length === 0) {
      return [];
    }

    const { workspaceId, agentMessageId, step } = blobs[0];
    assert(
      blobs.every(
        (blob) =>
          blob.workspaceId === workspaceId &&
          blob.agentMessageId === agentMessageId &&
          blob.step === step
      ),
      "createNewVersions requires all blobs to share the same workspaceId, agentMessageId, and step"
    );

    const indexes = [...new Set(blobs.map((blob) => blob.index))];
    const existingContent = await this.model.findAll({
      where: {
        workspaceId,
        agentMessageId,
        step,
        index: { [Op.in]: indexes },
      },
      attributes: ["index", "version"],
    });

    const maxVersionByIndex = new Map<number, number>();
    for (const row of existingContent) {
      const current = maxVersionByIndex.get(row.index);
      if (current === undefined || row.version > current) {
        maxVersionByIndex.set(row.index, row.version);
      }
    }

    const rowsToCreate = blobs.map((blob) => {
      const maxVersion = maxVersionByIndex.get(blob.index);
      const version = maxVersion !== undefined ? maxVersion + 1 : 0;
      // Advance so duplicate indexes in the same batch get consecutive versions.
      maxVersionByIndex.set(blob.index, version);
      return { ...blob, version };
    });

    const created = await this.model.bulkCreate(rowsToCreate, {
      validate: true,
      returning: true,
    });

    const resources = created.map(
      (row) => new AgentStepContentResource(this.model, row.get())
    );

    await warmAgentStepContentCacheMany(resources.map((r) => r.toCachedJSON()));

    return resources;
  }

  get sId(): string {
    return AgentStepContentResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("agent_step_content", {
      id,
      workspaceId,
    });
  }
}
