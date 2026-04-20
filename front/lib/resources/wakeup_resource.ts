import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  WakeUpScheduleType,
  WakeUpStatus,
} from "@app/lib/resources/storage/models/wakeup";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction, WhereOptions } from "sequelize";
import { literal } from "sequelize";

const ENABLE_WAKE_UP_TEMPORAL = false;
const ACTIVE_WAKE_UP_STATUSES: WakeUpStatus[] = ["scheduled"];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WakeUpResource extends ReadonlyAttributesType<WakeUpModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WakeUpResource extends BaseResource<WakeUpModel> {
  static model: ModelStaticWorkspaceAware<WakeUpModel> = WakeUpModel;

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
    const { where, ...otherOptions } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<WakeUpModel>,
      ...otherOptions,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async makeNew(
    auth: Authenticator,
    blob: {
      scheduleType: WakeUpScheduleType;
      fireAt: Date | null;
      cronExpression: string | null;
      cronTimezone: string | null;
      reason: string;
      status?: WakeUpStatus;
      fireCount?: number;
    },
    conversation: ConversationResource,
    agentConfiguration: AgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<WakeUpResource, Error>> {
    const { status = "scheduled", fireCount = 0, ...wakeUpBlob } = blob;

    try {
      const row = await this.model.create(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          userId: auth.user()?.id ?? null,
          agentConfigurationId: agentConfiguration.sId,
          status,
          fireCount,
          ...wakeUpBlob,
        },
        { transaction }
      );

      const wakeUp = new this(this.model, row.get());
      const temporalResult = await wakeUp.startTemporalWorkflow(auth);
      if (temporalResult.isErr()) {
        return temporalResult;
      }

      return new Ok(wakeUp);
    } catch (error) {
      return new Err(normalizeError(error));
    }
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
      async (wakeUp) => wakeUp.cancel(auth, { transaction }),
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

    try {
      const [affectedCount, affectedRows] = await this.model.update(
        {
          status: "cancelled",
        },
        {
          where: {
            id: this.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            status: "scheduled",
          } as WhereOptions<WakeUpModel>,
          transaction,
          returning: true,
        }
      );

      if (affectedCount > 0 && affectedRows[0]) {
        Object.assign(this, affectedRows[0].get());
      }

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
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

    try {
      const [affectedCount, affectedRows] = await this.model.update(
        {
          fireCount: literal('"fireCount" + 1'),
          status: nextStatus,
        },
        {
          where: {
            id: this.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            status: "scheduled",
          } as WhereOptions<WakeUpModel>,
          transaction,
          returning: true,
        }
      );

      if (affectedCount > 0 && affectedRows[0]) {
        Object.assign(this, affectedRows[0].get());
      }

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        } as WhereOptions<WakeUpModel>,
        transaction,
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  private async startTemporalWorkflow(
    _auth: Authenticator
  ): Promise<Result<void, Error>> {
    if (!ENABLE_WAKE_UP_TEMPORAL) {
      return new Ok(undefined);
    }

    return new Err(new Error("Wake-up Temporal start is not implemented yet."));
  }

  private async cancelTemporalWorkflow(
    _auth: Authenticator
  ): Promise<Result<void, Error>> {
    if (!ENABLE_WAKE_UP_TEMPORAL) {
      return new Ok(undefined);
    }

    return new Err(
      new Error("Wake-up Temporal cancellation is not implemented yet.")
    );
  }
}
