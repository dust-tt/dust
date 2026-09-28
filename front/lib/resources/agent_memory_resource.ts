import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/agent_memory/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationWithoutModelType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// We define a memory limit of 16K characters per user and agent configuration. -> ~4000 tokens.
// This is not perfect and could be configured according to the model's context window, but it's a good starting point.
export const AGENT_MEMORY_LIMIT = 16 * 1024;

type AgentMemoryEdit = {
  index: number;
  content: string;
};

export type AgentMemoryEntry = {
  lastUpdated: Date;
  content: string;
};

// The outcome of a write: the memory as it stands afterwards, the entries evicted to keep it within
// AGENT_MEMORY_LIMIT, and the contents that could never be stored because a single one of them
// exceeds the limit.
export type AgentMemoryWriteResult = {
  entries: AgentMemoryEntry[];
  evicted: AgentMemoryEntry[];
  skipped: string[];
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMemoryResource
  extends ReadonlyAttributesType<AgentMemoryModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMemoryResource extends BaseResource<AgentMemoryModel> {
  static model: ModelStaticWorkspaceAware<AgentMemoryModel> = AgentMemoryModel;

  constructor(
    model: ModelStatic<AgentMemoryModel>,
    blob: Attributes<AgentMemoryModel>
  ) {
    super(AgentMemoryModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<AgentMemoryModel>,
    transaction?: Transaction
  ) {
    const memory = await AgentMemoryModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(AgentMemoryModel, memory.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentMemoryModel>,
    transaction?: Transaction
  ) {
    const { where, ...otherOptions } = options ?? {};

    const memories = await AgentMemoryModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    return memories.map((m) => new this(AgentMemoryModel, m.get()));
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    return this.baseFetch(auth, {
      where: {
        id: ids,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async fetchByIds(auth: Authenticator, ids: string[]) {
    return AgentMemoryResource.fetchByModelIds(
      auth,
      removeNulls(ids.map(getResourceIdFromSId))
    );
  }

  /**
   * @cc [owner:tdraier,label:security] memory-fetch-bound-to-agent-and-user
   * Returns the memory only if it belongs to both the given agent and the given user, so a caller
   * authorized on one agent cannot reach another agent's memory by its id.
   */
  static async fetchByIdForAgentAndUser(
    auth: Authenticator,
    {
      agent,
      user,
      memoryId,
    }: { agent: AgentResource; user: UserType | null; memoryId: string }
  ): Promise<AgentMemoryResource | null> {
    const id = getResourceIdFromSId(memoryId);
    if (!id) {
      return null;
    }

    const [memory] = await this.baseFetch(auth, {
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: agent.sId,
        userId: user?.id ?? null,
      },
    });
    return memory ?? null;
  }

  static async findByAgentConfigurationAndUser(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
    },
    transaction?: Transaction
  ): Promise<AgentMemoryResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          agentConfigurationId: agentConfiguration.sId,
          userId: user?.id ?? null,
        },
        order: [
          ["updatedAt", "DESC"],
          ["id", "DESC"],
        ],
      },
      transaction
    );
  }

  static async findByAgentConfigurationIdAndUser(
    auth: Authenticator,
    {
      agentConfigurationId,
    }: {
      agentConfigurationId: string;
    },
    transaction?: Transaction
  ): Promise<AgentMemoryResource[]> {
    const userId = auth.user()?.id ?? null;
    if (!userId) {
      return [];
    }

    return this.baseFetch(
      auth,
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          agentConfigurationId,
          userId,
        },
        order: [
          ["updatedAt", "DESC"],
          ["id", "DESC"],
        ],
      },
      transaction
    );
  }

  async updateContent(auth: Authenticator, content: string) {
    return this.update({ content });
  }

  /**
   * API used by the agent memory MCP server
   */

  static async retrieveMemory(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
    }
  ): Promise<AgentMemoryEntry[]> {
    return (
      await this.findByAgentConfigurationAndUser(auth, {
        agentConfiguration,
        user,
      })
    )
      .map((m) => ({
        lastUpdated: m.updatedAt,
        content: m.content,
      }))
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  /**
   * @cc [owner:rfrenoy,label:product] memory-writes-never-fail-on-capacity
   * Recording entries MUST NOT fail because the memory is full. When the new entries do not fit
   * within `AGENT_MEMORY_LIMIT`, the least recently updated entries MUST be evicted to make room,
   * and both the evicted entries and the entries too large to ever be stored MUST be returned to
   * the caller so it can report them.
   */
  static async recordEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      entries,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
      entries: string[];
    }
  ): Promise<AgentMemoryWriteResult> {
    // An entry longer than the whole budget can never be stored: no amount of eviction makes room
    // for it.
    const skipped = entries.filter(
      (content) => content.length > AGENT_MEMORY_LIMIT
    );
    const accepted = entries.filter(
      (content) => content.length <= AGENT_MEMORY_LIMIT
    );

    const evicted = await withTransaction(async (t) => {
      await AgentMemoryModel.bulkCreate(
        accepted.map((content) => ({
          workspaceId: auth.getNonNullableWorkspace().id,
          agentConfigurationId: agentConfiguration.sId,
          content,
          userId: user?.id ?? null,
        })),
        { transaction: t }
      );

      return this.enforceMemoryLimit(auth, { agentConfiguration, user }, t);
    });

    const memories = await AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user,
    });
    return { entries: memories, evicted, skipped };
  }

  /**
   * @cc [owner:rfrenoy,label:product] memory-total-within-limit
   * Absent concurrent writes to the same (user, agent configuration) memory, the total content
   * length MUST be at most `AGENT_MEMORY_LIMIT` on return, achieved by deleting entries. Entries
   * are kept newest first: an entry MUST be evicted only when the entries updated more recently
   * than it, together with itself, exceed the limit. A write large enough to exceed the limit on
   * its own therefore evicts part of what it just wrote. Concurrent writes are not serialized and
   * each enforces the limit against the state it can see, so a race can leave the total above the
   * limit until the next write trims it back.
   */
  private static async enforceMemoryLimit(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
    },
    transaction: Transaction
  ): Promise<AgentMemoryEntry[]> {
    const memories = await this.findByAgentConfigurationAndUser(
      auth,
      { agentConfiguration, user },
      transaction
    );

    let characterCount = 0;
    const evicted = memories.filter((memory) => {
      characterCount += memory.content.length;
      return characterCount > AGENT_MEMORY_LIMIT;
    });

    if (evicted.length === 0) {
      return [];
    }

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: evicted.map((memory) => memory.id),
      },
      transaction,
    });

    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentConfigurationId: agentConfiguration.sId,
        userId: user?.sId ?? null,
        evictedCount: evicted.length,
      },
      "Evicted agent memory entries to stay within the memory limit"
    );

    return evicted.map((memory) => ({
      lastUpdated: memory.updatedAt,
      content: memory.content,
    }));
  }

  static async eraseEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      indexes,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
      indexes: number[];
    }
  ): Promise<AgentMemoryEntry[]> {
    await withTransaction(async (t) => {
      const memories = (
        await this.findByAgentConfigurationAndUser(
          auth,
          {
            agentConfiguration,
            user,
          },
          t
        )
      ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      await concurrentExecutor(
        indexes,
        async (i) => {
          await memories[i]?.delete(auth, { transaction: t });
        },
        { concurrency: 4 }
      );
    });

    return AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user,
    });
  }

  /**
   * @cc [owner:rfrenoy,label:product] memory-writes-never-fail-on-capacity
   * Editing entries MUST NOT fail because the memory is full. When the edits do not fit within
   * `AGENT_MEMORY_LIMIT`, the least recently updated entries MUST be evicted to make room, and both
   * the evicted entries and the edits too large to ever be stored MUST be returned to the caller so
   * it can report them.
   */
  static async editEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      edits,
    }: {
      agentConfiguration: LightAgentConfigurationWithoutModelType;
      user: UserType | null;
      edits: AgentMemoryEdit[];
    }
  ): Promise<AgentMemoryWriteResult> {
    const skipped = edits
      .filter(({ content }) => content.length > AGENT_MEMORY_LIMIT)
      .map(({ content }) => content);
    const accepted = edits.filter(
      ({ content }) => content.length <= AGENT_MEMORY_LIMIT
    );

    const evicted = await withTransaction(async (t) => {
      const memories = (
        await this.findByAgentConfigurationAndUser(
          auth,
          {
            agentConfiguration,
            user,
          },
          t
        )
      ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      await concurrentExecutor(
        accepted,
        async ({ index, content }) => {
          const m = memories[index];
          if (m) {
            await m.update({ content }, t);
          } else {
            // If the index does not exist we create a new memory.
            await this.makeNew(
              auth,
              {
                agentConfigurationId: agentConfiguration.sId,
                content: content,
                userId: user?.id ?? null,
              },
              t
            );
          }
        },
        { concurrency: 4 }
      );

      return this.enforceMemoryLimit(auth, { agentConfiguration, user }, t);
    });

    const memories = await AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user,
    });
    return { entries: memories, evicted, skipped };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  get sId(): string {
    return AgentMemoryResource.modelIdToSId({
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
    return makeSId(AGENT_MEMORY_SERVER_NAME, {
      id,
      workspaceId,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
      lastUpdated: this.updatedAt,
      content: this.content,
    };
  }
}
