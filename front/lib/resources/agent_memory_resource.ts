import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  LightAgentConfigurationType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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
    blob: CreationAttributes<AgentMemoryModel>
  ) {
    const memory = await AgentMemoryModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new this(AgentMemoryModel, memory.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentMemoryModel>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const memories = await AgentMemoryModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    return memories.map((m) => new this(AgentMemoryModel, m.get()));
  }

  private static async findByAgentConfiguration(
    auth: Authenticator,
    {
      agentConfiguration,
      forUser,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      forUser: UserType | null;
    }
  ): Promise<AgentMemoryResource | null> {
    const [agentMemory] = await this.baseFetch(auth, {
      where: {
        agentConfigurationId: agentConfiguration.sId,
        userId: forUser?.id ?? null,
      },
    });

    return agentMemory ?? null;
  }

  /**
   * API used by the agent memory MCP server
   */

  static async retrieveMemories(
    auth: Authenticator,
    {
      agentConfiguration,
      forUser,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      forUser: UserType | null;
    }
  ): Promise<AgentMemoryResource | null> {
    return this.findByAgentConfiguration(auth, {
      agentConfiguration,
      forUser,
    });
  }

  static async recordMemory(
    auth: Authenticator,
    {
      agentConfiguration,
      forUser,
      content,
      index,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      forUser: UserType | null;
      content: string;
      index?: number;
    }
  ): Promise<AgentMemoryResource> {
    let memory = await this.findByAgentConfiguration(auth, {
      agentConfiguration,
      forUser,
    });
    if (!memory) {
      memory = await this.makeNew(auth, {
        agentConfigurationId: agentConfiguration.sId,
        content: [],
        userId: forUser?.id ?? null,
      });
    }

    const c = memory.content;
    if (index !== undefined) {
      // Insert at specific index
      c.splice(index, 0, content);
    } else {
      // Append to the end
      c.push(content);
    }

    await memory.update({
      content: c,
    });

    return memory;
  }

  static async eraseMemory(
    auth: Authenticator,
    {
      agentConfiguration,
      forUser,
      index,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      forUser: UserType | null;
      index: number;
    }
  ): Promise<AgentMemoryResource | null> {
    const memory = await this.findByAgentConfiguration(auth, {
      agentConfiguration,
      forUser,
    });

    if (memory) {
      const c = memory.content;
      if (index >= 0 && index < c.length) {
        c.splice(index, 1);
        await memory.update({ content: c });
      }
    }

    return memory;
  }

  static async overwriteMemory(
    auth: Authenticator,
    {
      agentConfiguration,
      forUser,
      index,
      content,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      forUser: UserType | null;
      index: number;
      content: string;
    }
  ): Promise<Result<AgentMemoryResource | null, Error>> {
    const memory = await this.findByAgentConfiguration(auth, {
      agentConfiguration,
      forUser,
    });

    if (memory) {
      const c = memory.content;
      if (index >= 0 && index < c.length) {
        c[index] = content;
        await memory.update({ content: c });
      } else {
        return new Err(new Error(`Index ${index} does not exist in memory.`));
      }
    }

    return new Ok(memory);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
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
    return makeSId("tag", {
      id,
      workspaceId,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
    };
  }
}
