import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { TriggerSubscriberModel } from "@app/lib/models/assistant/triggers/trigger_subscriber";
import { TriggerModel } from "@app/lib/models/assistant/triggers/triggers";
import { WebhookRequestModel } from "@app/lib/models/assistant/triggers/webhook_request";
import { WebhookRequestTriggerModel } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { WebhookSourcesViewModel } from "@app/lib/models/assistant/triggers/webhook_sources_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  createOrUpdateAgentScheduleWorkflow,
  deleteAgentScheduleWorkflow,
} from "@app/lib/triggers/temporal/schedule/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId, Result } from "@app/types";
import {
  assertNever,
  Err,
  errorToString,
  normalizeError,
  Ok,
} from "@app/types";
import type {
  ScheduleConfig,
  TriggerType,
  WebhookConfig,
} from "@app/types/assistant/triggers";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface TriggerResource extends ReadonlyAttributesType<TriggerModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TriggerResource extends BaseResource<TriggerModel> {
  static model: ModelStatic<TriggerModel> = TriggerModel;

  constructor(
    model: ModelStatic<TriggerModel>,
    blob: Attributes<TriggerModel>
  ) {
    super(TriggerModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TriggerModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<TriggerResource, Error>> {
    const trigger = await TriggerModel.create(blob, {
      transaction,
    });

    const resource = new this(TriggerModel, trigger.get());
    const r = await resource.upsertTemporalWorkflow(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(resource);
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<TriggerModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async fetchByIds(auth: Authenticator, sIds: string[]) {
    const ids = sIds
      .map((sId) => getResourceIdFromSId(sId))
      .filter((id): id is number => id !== null);

    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: ids,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<TriggerResource | null> {
    const res = await this.fetchByIds(auth, [sId]);
    return res.length > 0 ? res[0] : null;
  }

  static listByAgentConfigurationId(
    auth: Authenticator,
    agentConfigurationId: string
  ) {
    return this.baseFetch(auth, {
      where: {
        agentConfigurationId,
      },
    });
  }

  static listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  static async listByWebhookSourceViewId(
    auth: Authenticator,
    webhookSourceViewId: ModelId
  ) {
    return this.baseFetch(auth, {
      where: {
        webhookSourceViewId,
        kind: "webhook",
      },
    });
  }

  static async listByUserEditor(auth: Authenticator) {
    const user = auth.getNonNullableUser();

    return this.baseFetch(auth, {
      where: {
        editor: user.id,
      },
    });
  }

  static async listByUserSubscriber(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const res = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        // Exclude triggers where user is also editor to avoid duplicates
        editor: { [Op.ne]: user.id },
      },
      include: [
        {
          model: TriggerSubscriberModel,
          as: "trigger_subscribers",
          required: true,
          attributes: [],
          where: {
            userId: user.id,
          },
        },
      ],
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<InferAttributes<TriggerModel, { omit: "workspaceId" }>>,
    transaction?: Transaction
  ) {
    const trigger = await this.fetchById(auth, sId);
    if (!trigger) {
      return new Err(new Error(`Trigger with sId ${sId} not found`));
    }

    if (!trigger.editor || trigger.editor !== auth.getNonNullableUser().id) {
      return new Err(
        new Error("Only the editor of the trigger can update the trigger")
      );
    }

    await trigger.update(blob, transaction);
    const r = await trigger.upsertTemporalWorkflow(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(trigger);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const r = await this.removeTemporalWorkflow(auth);
    if (r.isErr()) {
      return r;
    }

    try {
      if (this.kind === "webhook" && this.webhookSourceViewId) {
        const webhookSourceView = await WebhookSourcesViewModel.findOne({
          where: {
            id: this.webhookSourceViewId,
            workspaceId: owner.id,
          },
        });

        if (!webhookSourceView) {
          return new Err(new Error("Webhook source view not found"));
        }

        const webhookRequests = await WebhookRequestModel.findAll({
          where: {
            workspaceId: owner.id,
            webhookSourceId: webhookSourceView.webhookSourceId,
          },
        });

        await WebhookRequestTriggerModel.destroy({
          where: {
            workspaceId: owner.id,
            webhookRequestId: {
              [Op.in]: webhookRequests.map((w) => w.id),
            },
          },
        });
        await WebhookRequestModel.destroy({
          where: {
            id: { [Op.in]: webhookRequests.map((w) => w.id) },
          },
        });
      }

      await TriggerSubscriberModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          triggerId: this.id,
        },
      });
      await TriggerModel.destroy({
        where: {
          id: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static async deleteAllForWorkspace(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    const r = await concurrentExecutor(
      triggers,
      async (trigger) => {
        try {
          return await trigger.delete(auth);
        } catch (error) {
          return new Err(normalizeError(error));
        }
      },
      {
        concurrency: 10,
      }
    );

    if (r.find((res) => res.isErr())) {
      return new Err(
        new Error(
          `Failed to delete ${r.filter((res) => res.isErr()).length} some triggers`
        )
      );
    }
    return new Ok(undefined);
  }

  static async disableAllForWorkspace(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    // Only disable enabled triggers
    const enabledTriggers = triggers.filter((t) => t.enabled);
    if (enabledTriggers.length === 0) {
      return new Ok(undefined);
    }

    const disabledTriggersResult = await concurrentExecutor(
      enabledTriggers,
      async (trigger) => trigger.disable(auth),
      {
        concurrency: 10,
      }
    );

    const failuresCount = disabledTriggersResult.filter((res) =>
      res.isErr()
    ).length;

    if (failuresCount > 0) {
      return new Err(new Error(`Failed to disable ${failuresCount} triggers`));
    }
    return new Ok(undefined);
  }

  /**
   * We can not use the getAgentConfigurations method here, because of dependency cycle.
   */
  private static async getActiveAgentFromTriggers(
    auth: Authenticator,
    triggers: TriggerResource[]
  ): Promise<Result<Set<string> | undefined, Error>> {
    // Get all unique agent configuration IDs from disabled triggers
    const agentConfigurationIds = [
      ...new Set(triggers.map((t) => t.agentConfigurationId)),
    ];

    if (agentConfigurationIds.length === 0) {
      return new Ok(undefined);
    }

    // Query latest versions of all agent configurations at once
    const agentConfigs = await AgentConfiguration.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: agentConfigurationIds,
      },
    });

    // Get only the latest version of each agent config (by latest createdAt)
    const latestAgentConfigs = new Map<string, AgentConfiguration>();
    for (const config of agentConfigs) {
      const existing = latestAgentConfigs.get(config.sId);
      if (
        !existing ||
        new Date(config.createdAt).getTime() >
          new Date(existing.createdAt).getTime()
      ) {
        latestAgentConfigs.set(config.sId, config);
      }
    }

    // Create a map of agent config ID to status for quick lookup
    const activeAgentIds = new Set(
      Array.from(latestAgentConfigs.values())
        .filter((config) => config.status === "active")
        .map((config) => config.sId)
    );

    return new Ok(activeAgentIds);
  }

  static async enableAllForWorkspace(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    const triggers = await this.listByWorkspace(auth);
    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    // Only enable disabled triggers that point to non-archived agents
    const disabledTriggers = triggers.filter((t) => !t.enabled);
    if (disabledTriggers.length === 0) {
      return new Ok(undefined);
    }

    const rActiveAgentIds = await this.getActiveAgentFromTriggers(
      auth,
      disabledTriggers
    );
    if (rActiveAgentIds.isErr()) {
      return rActiveAgentIds;
    }

    const activeAgentIds = rActiveAgentIds.value;
    if (!activeAgentIds || activeAgentIds.size === 0) {
      return new Ok(undefined);
    }

    // Filter triggers to only include those pointing to active agents
    const enableableTriggers = disabledTriggers.filter((trigger) =>
      activeAgentIds.has(trigger.agentConfigurationId)
    );

    if (enableableTriggers.length === 0) {
      return new Ok(undefined);
    }

    const enabledTriggersResult = await concurrentExecutor(
      enableableTriggers,
      async (trigger) => trigger.enable(auth),
      {
        concurrency: 10,
      }
    );

    const failuresCount = enabledTriggersResult.filter((res) =>
      res.isErr()
    ).length;

    if (failuresCount > 0) {
      return new Err(new Error(`Failed to enable ${failuresCount} triggers`));
    }
    return new Ok(undefined);
  }

  async upsertTemporalWorkflow(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        return createOrUpdateAgentScheduleWorkflow({
          auth,
          trigger: this,
        });
      case "webhook":
        return new Ok(undefined);
      default:
        assertNever(this.kind);
    }
  }

  async removeTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    switch (this.kind) {
      case "schedule":
        return deleteAgentScheduleWorkflow({
          workspaceId: auth.getNonNullableWorkspace().sId,
          trigger: this,
        });
      case "webhook":
        return new Ok(undefined);
      default:
        assertNever(this.kind);
    }
  }

  async enable(auth: Authenticator): Promise<Result<undefined, Error>> {
    if (this.enabled) {
      return new Ok(undefined);
    }

    try {
      await this.update({ enabled: true });
    } catch (error) {
      return new Err(normalizeError(error));
    }

    const editor = await UserResource.fetchByModelId(this.editor);
    if (!editor) {
      return new Err(new Error("Trigger editor user not found"));
    }
    const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editor.sId,
      auth.getNonNullableWorkspace().sId
    );

    // Re-register the temporal workflow
    const r = await this.upsertTemporalWorkflow(editorAuth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async disable(auth: Authenticator): Promise<Result<undefined, Error>> {
    if (!this.enabled) {
      return new Ok(undefined);
    }

    try {
      await this.update({ enabled: false });
    } catch (error) {
      return new Err(normalizeError(error));
    }

    // Remove the temporal workflow
    const r = await this.removeTemporalWorkflow(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async addToSubscribers(
    auth: Authenticator
  ): Promise<
    Result<
      undefined,
      DustError<"unauthorized" | "internal_error" | "internal_error">
    >
  > {
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return new Err(
        new DustError("unauthorized", "User do not have access to this trigger")
      );
    }

    if (auth.getNonNullableUser().id === this.editor) {
      return new Err(
        new DustError("internal_error", "User is the editor of the trigger")
      );
    }

    try {
      await TriggerSubscriberModel.create({
        workspaceId: auth.getNonNullableWorkspace().id,
        triggerId: this.id,
        userId: auth.getNonNullableUser().id,
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(new DustError("internal_error", errorToString(error)));
    }
  }

  async removeFromSubscribers(
    auth: Authenticator
  ): Promise<Result<undefined, DustError<"unauthorized" | "internal_error">>> {
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return new Err(
        new DustError("unauthorized", "User do not have access to this trigger")
      );
    }

    try {
      await TriggerSubscriberModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          triggerId: this.id,
          userId: auth.getNonNullableUser().id,
        },
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(new DustError("internal_error", errorToString(error)));
    }
  }

  async getSubscribers(
    auth: Authenticator
  ): Promise<
    Result<UserResource[], DustError<"unauthorized" | "internal_error">>
  > {
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return new Err(
        new DustError("unauthorized", "User do not have access to this trigger")
      );
    }

    try {
      const subscribers = await TriggerSubscriberModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          triggerId: this.id,
        },
      });

      const userResources = await UserResource.fetchByModelIds(
        subscribers.map((subscriber) => subscriber.userId)
      );

      return new Ok(userResources);
    } catch (error) {
      return new Err(new DustError("internal_error", errorToString(error)));
    }
  }

  async isSubscriber(auth: Authenticator): Promise<boolean> {
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return false;
    }

    if (auth.getNonNullableUser().id === this.editor) {
      return false;
    }

    const nbSubscribers = await TriggerSubscriberModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        triggerId: this.id,
        userId: auth.getNonNullableUser().id,
      },
    });

    return nbSubscribers > 0;
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("trigger", {
      id,
      workspaceId,
    });
  }

  sId(): string {
    return TriggerResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  toJSON(): TriggerType {
    const base = {
      id: this.id,
      sId: this.sId(),
      name: this.name,
      agentConfigurationId: this.agentConfigurationId,
      editor: this.editor,
      customPrompt: this.customPrompt,
      enabled: this.enabled,
      createdAt: this.createdAt.getTime(),
    };

    if (this.kind === "webhook") {
      return {
        ...base,
        kind: "webhook" as const,
        configuration: this.configuration as WebhookConfig,
        webhookSourceViewSId: this.webhookSourceViewId
          ? makeSId("webhook_sources_view", {
              id: this.webhookSourceViewId,
              workspaceId: this.workspaceId,
            })
          : null,
      };
    } else {
      return {
        ...base,
        kind: "schedule" as const,
        configuration: this.configuration as ScheduleConfig,
      };
    }
  }
}
