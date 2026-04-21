import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  cancelWakeUpTemporalWorkflow,
  launchOrScheduleWakeUpTemporalWorkflow,
} from "@app/temporal/triggers/wakeup/client";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  WakeUpScheduleConfig,
  WakeUpStatus,
  WakeUpType,
} from "@app/types/assistant/wakeups";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, Transaction, WhereOptions } from "sequelize";

const ACTIVE_WAKE_UP_STATUSES: WakeUpStatus[] = ["scheduled"];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WakeUpResource extends ReadonlyAttributesType<WakeUpModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WakeUpResource extends BaseResource<WakeUpModel> {
  static model: ModelStaticWorkspaceAware<WakeUpModel> = WakeUpModel;

  get sId(): string {
    return WakeUpResource.modelIdToSId({
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
    return makeSId("wake_up", { id, workspaceId });
  }

  constructor(
    model: ModelStaticWorkspaceAware<WakeUpModel>,
    blob: Attributes<WakeUpModel>
  ) {
    super(model, blob);
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<WakeUpModel>
  ): Promise<WakeUpResource[]> {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async makeNew(
    auth: Authenticator,
    blob:
      | {
          scheduleType: "one_shot";
          fireAt: Date;
          cronExpression: null;
          cronTimezone: null;
          reason: string;
        }
      | {
          scheduleType: "cron";
          fireAt: null;
          cronExpression: string;
          cronTimezone: string;
          reason: string;
        },
    conversation: ConversationResource,
    agentConfiguration: AgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<WakeUpResource, Error>> {
    const { scheduleType, fireAt, cronExpression, cronTimezone, reason } = blob;

    const row = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        userId: auth.user()?.id ?? null,
        agentConfigurationId: agentConfiguration.sId,
        status: "scheduled",
        fireCount: 0,
        scheduleType,
        fireAt,
        cronExpression,
        cronTimezone,
        reason,
      },
      { transaction }
    );

    const wakeUp = new this(this.model, row.get());
    const temporalResult = await wakeUp.startTemporalWorkflow(auth);
    if (temporalResult.isErr()) {
      return temporalResult;
    }

    return new Ok(wakeUp);
  }

  static async listByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<WakeUpResource[]> {
    return this.baseFetch(auth, {
      where: {
        conversationId: conversation.id,
      },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });
  }

  static async listActiveByWorkspace(
    auth: Authenticator
  ): Promise<WakeUpResource[]> {
    return this.baseFetch(auth, {
      where: {
        status: ACTIVE_WAKE_UP_STATUSES,
      },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });
  }

  static async deleteByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const wakeUps = await this.listByConversation(auth, conversation);

    const activeWakeUps = wakeUps.filter((wakeUp) =>
      ACTIVE_WAKE_UP_STATUSES.includes(wakeUp.status)
    );

    const cancelResults = await concurrentExecutor(
      activeWakeUps,
      async (wakeUp) => wakeUp.cancelTemporalWorkflow(auth),
      { concurrency: 10 }
    );

    const cancellationError = cancelResults.find((result) => result.isErr());
    if (cancellationError?.isErr()) {
      throw cancellationError.error;
    }

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
      } as WhereOptions<WakeUpModel>,
      transaction,
    });
  }

  async cancel(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<void, Error>> {
    if (this.status !== "scheduled") {
      return new Ok(undefined);
    }

    const temporalResult = await this.cancelTemporalWorkflow(auth);
    if (temporalResult.isErr()) {
      return temporalResult;
    }

    await this.update(
      {
        status: "cancelled",
      },
      transaction
    );

    return new Ok(undefined);
  }

  async markFired(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<void, Error>> {
    if (this.status !== "scheduled") {
      return new Ok(undefined);
    }

    const nextStatus: WakeUpStatus =
      this.scheduleType === "one_shot" ? "fired" : "scheduled";

    await this.update(
      {
        fireCount: this.fireCount + 1,
        status: nextStatus,
      },
      transaction
    );

    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<WakeUpModel>,
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON(): WakeUpType {
    const scheduleConfig: WakeUpScheduleConfig = (() => {
      switch (this.scheduleType) {
        case "one_shot": {
          if (!this.fireAt) {
            throw new Error("Wake-up is missing fireAt for one-shot schedule.");
          }

          return {
            type: "one_shot",
            fireAt: this.fireAt.getTime(),
          };
        }
        case "cron": {
          if (!this.cronExpression || !this.cronTimezone) {
            throw new Error(
              "Wake-up is missing cron schedule fields for cron schedule."
            );
          }

          return {
            type: "cron",
            cron: this.cronExpression,
            timezone: this.cronTimezone,
          };
        }
        default:
          return assertNever(this.scheduleType);
      }
    })();

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      agentConfigurationId: this.agentConfigurationId,
      scheduleConfig,
      reason: this.reason,
      status: this.status,
      fireCount: this.fireCount,
    };
  }

  private async startTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    return launchOrScheduleWakeUpTemporalWorkflow({
      auth,
      wakeUp: this.toJSON(),
    });
  }

  private async cancelTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    return cancelWakeUpTemporalWorkflow({
      auth,
      wakeUp: this.toJSON(),
    });
  }
}
