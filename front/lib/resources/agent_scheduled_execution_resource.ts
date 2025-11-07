import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  AgentScheduledExecutionModel,
  type AgentScheduledExecutionStatus,
} from "@app/lib/models/assistant/agent_scheduled_execution";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentScheduledExecutionResource
  extends ReadonlyAttributesType<AgentScheduledExecutionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentScheduledExecutionResource extends BaseResource<AgentScheduledExecutionModel> {
  static model: ModelStaticWorkspaceAware<AgentScheduledExecutionModel> =
    AgentScheduledExecutionModel;

  constructor(
    model: ModelStatic<AgentScheduledExecutionModel>,
    blob: Attributes<AgentScheduledExecutionModel>
  ) {
    super(AgentScheduledExecutionModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<AgentScheduledExecutionModel>,
    transaction?: Transaction
  ) {
    const execution = await AgentScheduledExecutionResource.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(AgentScheduledExecutionResource.model, execution.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentScheduledExecutionModel>,
    transaction?: Transaction
  ) {
    const { where, ...otherOptions } = options ?? {};

    const executions = await AgentScheduledExecutionResource.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    return executions.map(
      (e) => new this(AgentScheduledExecutionResource.model, e.get())
    );
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
    return AgentScheduledExecutionResource.fetchByModelIds(
      auth,
      removeNulls(ids.map(getResourceIdFromSId))
    );
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<AgentScheduledExecutionResource | null> {
    const modelId = getResourceIdFromSId(id);
    if (!modelId) {
      return null;
    }

    const [execution] = await this.baseFetch(auth, {
      where: {
        id: modelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    return execution ?? null;
  }

  static async fetchByWorkflowId(
    auth: Authenticator,
    workflowId: string
  ): Promise<AgentScheduledExecutionResource | null> {
    const [execution] = await this.baseFetch(auth, {
      where: {
        workflowId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    return execution ?? null;
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: ModelId,
    options?: {
      status?: AgentScheduledExecutionStatus;
      limit?: number;
    }
  ): Promise<AgentScheduledExecutionResource[]> {
    const where: Record<string, unknown> = {
      conversationId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    return this.baseFetch(auth, {
      where,
      order: [["scheduledFor", "DESC"]],
      limit: options?.limit,
    });
  }

  static async fetchByAgentMessageId(
    auth: Authenticator,
    agentMessageId: ModelId
  ): Promise<AgentScheduledExecutionResource[]> {
    return this.baseFetch(auth, {
      where: {
        agentMessageId,
      },
      order: [["scheduledFor", "DESC"]],
    });
  }

  static async fetchScheduledExecutions(
    auth: Authenticator,
    options?: {
      limit?: number;
    }
  ): Promise<AgentScheduledExecutionResource[]> {
    return this.baseFetch(auth, {
      where: {
        status: "scheduled",
      },
      order: [["scheduledFor", "ASC"]],
      limit: options?.limit,
    });
  }

  async updateStatus(
    status: AgentScheduledExecutionStatus,
    error?: string | null
  ) {
    return this.update({ status, error: error ?? null });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
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

  static async deleteByConversationId(
    auth: Authenticator,
    conversationId: ModelId,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
      transaction,
    });
  }

  static async deleteByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: ModelId[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageIds,
      },
      transaction,
    });
  }

  static async deleteByMessageIds(
    auth: Authenticator,
    messageIds: ModelId[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userMessageId: messageIds,
      },
      transaction,
    });
  }

  get sId(): string {
    return AgentScheduledExecutionResource.modelIdToSId({
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
    return makeSId("agent_scheduled_execution", {
      id,
      workspaceId,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
      workflowId: this.workflowId,
      conversationId: this.conversationId,
      agentMessageId: this.agentMessageId,
      userMessageId: this.userMessageId,
      delayMs: this.delayMs,
      scheduledFor: this.scheduledFor.toISOString(),
      status: this.status,
      error: this.error,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
