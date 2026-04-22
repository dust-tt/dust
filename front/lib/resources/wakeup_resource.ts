import { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  cancelWakeUpTemporalWorkflow,
  launchOrScheduleWakeUpTemporalWorkflow,
} from "@app/temporal/triggers/wakeup_client";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  WakeUpScheduleConfig,
  WakeUpStatus,
  WakeUpType,
} from "@app/types/assistant/wakeups";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, Transaction, WhereOptions } from "sequelize";

const ACTIVE_WAKE_UP_STATUSES: WakeUpStatus[] = ["scheduled"];
const MAX_WAKE_UP_FIRES = 32;

// Minimum allowed interval between two cron fires, in minutes. Matches the per-conversation
// guardrail in the wake-up design doc.
const WAKE_UP_MIN_INTERVAL_MINUTES = 5;

// Standard 5-field cron regex. Does not support # (nth occurrence) or L (last) operators.
const WAKE_UP_CRON_REGEXP =
  /^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*(\/\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})|(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)$/;

function isValidIANATimezone(timezone: string): boolean {
  const supportedTimezones = Intl.supportedValuesOf("timeZone");
  return supportedTimezones.includes(timezone);
}

// A cron expression is considered too frequent if its minutes field fires more than once every
// `WAKE_UP_MIN_INTERVAL_MINUTES` minutes. Accepts a literal minute ("0", "15") or a `*/N` step with
// `N >= WAKE_UP_MIN_INTERVAL_MINUTES`.
function isWakeUpCronTooFrequent(cron: string): boolean {
  const minutes = cron.split(" ")[0];

  if (/^\d+$/.test(minutes)) {
    return false;
  }

  const stepMatch = /^\*\/(\d+)$/.exec(minutes);
  if (stepMatch && parseInt(stepMatch[1], 10) >= WAKE_UP_MIN_INTERVAL_MINUTES) {
    return false;
  }

  return true;
}

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

  /**
   * Validates a cron expression and its timezone for wake-ups. Mirrors the trigger schedule
   * validation but enforces the wake-up specific minimum interval between fires.
   */
  static validateCron({
    cron,
    timezone,
  }: {
    cron: string;
    timezone: string;
  }): Result<void, Error> {
    if (
      !cron ||
      cron.split(" ").length !== 5 ||
      !cron.match(WAKE_UP_CRON_REGEXP)
    ) {
      return new Err(
        new Error(
          "Invalid wake-up cron expression: expected 5 fields (min hour dom mon dow) " +
            "using standard operators (* , - / ?) or 3-letter names; '#' and 'L' are not supported."
        )
      );
    }

    if (isWakeUpCronTooFrequent(cron)) {
      return new Err(
        new Error(
          `Wake-up cron cannot fire more often than every ${WAKE_UP_MIN_INTERVAL_MINUTES} minutes.`
        )
      );
    }

    if (!timezone || !isValidIANATimezone(timezone)) {
      return new Err(
        new Error(
          'Invalid wake-up timezone (must be an IANA timezone, i.e. "Europe/Paris").'
        )
      );
    }

    return new Ok(undefined);
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
    const user = auth.getNonNullableUser();

    if (scheduleType === "cron") {
      const validation = this.validateCron({
        cron: cronExpression,
        timezone: cronTimezone,
      });
      if (validation.isErr()) {
        return validation;
      }
    }

    const row = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        userId: user.id,
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

  static async fetchById(
    auth: Authenticator,
    wakeUpId: string
  ): Promise<WakeUpResource | null> {
    const modelId = getResourceIdFromSId(wakeUpId);
    if (!modelId) {
      return null;
    }

    const [wakeUp] = await this.baseFetch(auth, {
      where: {
        id: modelId,
      },
    });

    return wakeUp ?? null;
  }

  static async listByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    { status }: { status?: WakeUpStatus | WakeUpStatus[] } = {}
  ): Promise<WakeUpResource[]> {
    return this.baseFetch(auth, {
      where: {
        conversationId: conversation.id,
        ...(status !== undefined ? { status } : {}),
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

  /**
   * Checks whether the caller can post or edit user messages in a conversation that has active
   * wake-ups. Rejects when any active (scheduled) wake-up is owned by a user other than the
   * current one — this keeps the agent running under the owner's auth from being steered by
   * another user before the wake-up fires. The wake-up activity itself posts under the owner's
   * auth (via `fetchWakeUpAndAuthenticatorById`), so fires are never blocked.
   *
   * The `(workspaceId, conversationId, status)` index covers this query.
   */
  static async canUserInteract(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<Result<void, APIErrorWithStatusCode>> {
    const activeWakeUps = await this.listByConversation(auth, conversation, {
      status: ACTIVE_WAKE_UP_STATUSES,
    });
    if (activeWakeUps.length === 0) {
      return new Ok(undefined);
    }
    const currentUserId = auth.user()?.id ?? null;
    const foreignWakeUp = activeWakeUps.find(
      (w) => w.userId !== currentUserId
    );
    if (!foreignWakeUp) {
      return new Ok(undefined);
    }
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message:
          "This conversation has an active wake-up owned by another user. " +
          "Only the wake-up owner can post or edit messages until the " +
          "wake-up fires or is cancelled.",
      },
    });
  }

  /**
   * This is used by the wake-up temporal activities to recover the wake-up resource and its
   * associated user's authenticator.
   */
  static async fetchWakeUpAndAuthenticatorById({
    workspaceId,
    wakeUpId,
  }: {
    workspaceId: string;
    wakeUpId: string;
  }): Promise<Result<{ auth: Authenticator; wakeUp: WakeUpResource }, Error>> {
    let auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
    const wakeUp = await WakeUpResource.fetchById(auth, wakeUpId);

    if (!wakeUp) {
      return new Err(new Error("WakeUp not found"));
    }

    const [user] = await UserResource.fetchByModelIds([wakeUp.userId]);
    if (!user) {
      return new Err(new Error("WakeUp user not found"));
    }

    auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspaceId);

    if (!auth.workspace() || !auth.user()) {
      return new Err(new Error("Invalid Authenticator for WakeUp"));
    }

    return new Ok({ auth, wakeUp });
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

  canCancel(auth: Authenticator): boolean {
    if (auth.isAdmin()) {
      return true;
    }
    return auth.user()?.id === this.userId;
  }

  async cancel(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<void, Error>> {
    if (!this.canCancel(auth)) {
      return new Err(
        new Error(
          "Only the wake-up owner or a workspace admin can cancel this wake-up."
        )
      );
    }

    if (this.status !== "scheduled") {
      return new Ok(undefined);
    }

    const temporalResult = await this.cancelTemporalWorkflow(auth);
    if (temporalResult.isErr()) {
      return temporalResult;
    }

    await this.markCancelled(auth, { transaction });

    return new Ok(undefined);
  }

  async markCancelled(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (this.status === "cancelled") {
      return;
    }

    await this.update(
      {
        status: "cancelled",
      },
      transaction
    );
  }

  async markExpired(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (this.status === "expired") {
      return;
    }

    await this.update(
      {
        status: "expired",
      },
      transaction
    );
  }

  maxFires(): number {
    return MAX_WAKE_UP_FIRES;
  }

  async markFired(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (this.status !== "scheduled") {
      return;
    }

    const nextFireCount = this.fireCount + 1;
    const nextStatus: WakeUpStatus =
      this.scheduleType === "one_shot"
        ? "fired"
        : nextFireCount >= this.maxFires()
          ? "expired"
          : "scheduled";

    await this.update(
      {
        fireCount: nextFireCount,
        status: nextStatus,
      },
      transaction
    );
  }

  async cleanupTemporalIfCronExpired(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    if (this.scheduleType !== "cron" || this.status !== "expired") {
      return new Ok(undefined);
    }

    return this.cancelTemporalWorkflow(auth);
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
      maxFires: this.maxFires(),
    };
  }

  private async startTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    return launchOrScheduleWakeUpTemporalWorkflow(auth, {
      wakeUp: this.toJSON(),
    });
  }

  private async cancelTemporalWorkflow(
    auth: Authenticator
  ): Promise<Result<void, Error>> {
    return cancelWakeUpTemporalWorkflow(auth, { wakeUp: this.toJSON() });
  }
}
