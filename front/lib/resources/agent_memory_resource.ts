import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  LightAgentConfigurationType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
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

  static async fetchByIdForUser(
    auth: Authenticator,
    { user, memoryId }: { user: UserType | null; memoryId: string }
  ): Promise<AgentMemoryResource | null> {
    const id = getResourceIdFromSId(memoryId);
    if (!id) {
      return null;
    }

    const [memory] = await this.baseFetch(auth, {
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
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
      agentConfiguration: LightAgentConfigurationType;
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
        order: [["updatedAt", "DESC"]],
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
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
    }
  ): Promise<{ lastUpdated: Date; content: string }[]> {
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

  static async recordEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      entries,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      entries: string[];
    }
  ): Promise<{ lastUpdated: Date; content: string }[]> {
    await concurrentExecutor(
      entries,
      async (content) => {
        await this.makeNew(auth, {
          agentConfigurationId: agentConfiguration.sId,
          content: content,
          userId: user?.id ?? null,
        });
      },
      { concurrency: 4 }
    );

    return AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user,
    });
  }

  static async eraseEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      indexes,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      indexes: number[];
    }
  ): Promise<{ lastUpdated: Date; content: string }[]> {
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

  static async editEntries(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      edits,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      edits: { index: number; content: string }[];
    }
  ): Promise<{ lastUpdated: Date; content: string }[]> {
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
        edits,
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
    });

    return AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user,
    });
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
