import { getSandboxProvider } from "@app/lib/api/sandbox";
import type {
  ExecOptions,
  ExecResult,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";
import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

interface EnsureSandboxResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxResource extends ReadonlyAttributesType<SandboxModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxResource extends BaseResource<SandboxModel> {
  static model: ModelStaticWorkspaceAware<SandboxModel> = SandboxModel;

  constructor(
    _model: ModelStatic<SandboxModel>,
    blob: Attributes<SandboxModel>
  ) {
    super(SandboxModel, blob);
  }

  get sId(): string {
    return SandboxResource.modelIdToSId({
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
    return makeSId("sandbox", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: {
      conversationId: number;
      providerId: string;
      status: SandboxStatus;
    },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const sandbox = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        lastActivityAt: new Date(),
      },
      { transaction }
    );

    return new this(this.model, sandbox.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SandboxModel>
  ) {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  /**
   * Return conversation sIds that have a sandbox with the given `status` and
   * whose `lastActivityAt` is older than `olderThanMs`. Used by the reaper
   * workflow to identify candidates for sleep/destroy.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyGetStaleConversationIds(opts: {
    status: SandboxStatus;
    olderThanMs: number;
    limit: number;
  }): Promise<string[]> {
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        status: opts.status,
        lastActivityAt: {
          [Op.lt]: new Date(Date.now() - opts.olderThanMs),
        },
      },
      include: [
        {
          model: ConversationModel,
          attributes: ["sId"],
          required: true,
        },
      ],
      order: [["lastActivityAt", "ASC"]],
      limit: opts.limit,
    });

    return rows.map((r) => r.conversation.sId);
  }

  /**
   * Fetch the sandbox for a conversation across all workspaces (no auth).
   * Only used by the reaper inside the lifecycle lock.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  private static async dangerouslyFetchByConversationId(
    conversationId: string
  ): Promise<SandboxResource | null> {
    const row = await this.model.findOne({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      include: [
        {
          model: ConversationModel,
          attributes: ["id"],
          required: true,
          where: { sId: conversationId },
        },
      ],
    });

    return row ? new this(this.model, row.get()) : null;
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: number
  ): Promise<SandboxResource | null> {
    const [row] = await this.baseFetch(auth, {
      where: { conversationId },
    });

    return row ?? null;
  }

  async updateStatus(
    status: SandboxStatus,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<[affectedCount: number]> {
    if (this.status === status) {
      return [0];
    }
    return this.update({ status }, transaction);
  }

  async updateLastActivityAt({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<[affectedCount: number]> {
    return this.update({ lastActivityAt: new Date() }, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await SandboxModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  static async deleteByConversationModelId(
    auth: Authenticator,
    conversationModelId: ModelId
  ): Promise<number> {
    return SandboxModel.destroy({
      where: {
        conversationId: conversationModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Provider-facing operations
  // ---------------------------------------------------------------------------

  private static async withLifecycleLock<T>(
    conversationId: string,
    fn: (provider: SandboxProvider) => Promise<Result<T, Error>>
  ): Promise<Result<T, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    return executeWithLock(`sandbox:lifecycle:${conversationId}`, () =>
      fn(provider)
    );
  }

  /**
   * Ensure a running sandbox exists for the given conversation.
   *
   * The provider is resolved internally — callers never touch it.
   */
  static async ensureActive(
    auth: Authenticator,
    conversation: ConversationType
  ): Promise<Result<EnsureSandboxResult, Error>> {
    assert(
      auth.getNonNullableWorkspace().id !== undefined,
      "Cannot ensure sandbox without a workspace"
    );

    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const conversationId = conversation.id;

      const existing = await SandboxResource.fetchByConversationId(
        auth,
        conversationId
      );

      if (!existing) {
        const createResult = await provider.create({});
        if (createResult.isErr()) {
          return createResult;
        }

        const sandbox = await SandboxResource.makeNew(auth, {
          conversationId,
          providerId: createResult.value.providerId,
          status: "running",
        });

        logger.info(
          { sandbox: sandbox.toLogJSON() },
          "Created new sandbox for conversation"
        );

        return new Ok({ sandbox, freshlyCreated: true });
      }

      const { status } = existing;
      let freshlyCreated = false;

      switch (status) {
        case "running":
          break;

        case "sleeping": {
          const wakeResult = await provider.wake(existing.providerId);
          if (wakeResult.isErr()) {
            // The sandbox may have been killed by the provider (e.g. lifetime
            // expired). Fall through to recreation instead of propagating the
            // error.
            logger.error(
              {
                sandbox: existing.toLogJSON(),
                error: wakeResult.error.message,
              },
              "Failed to wake sandbox — will recreate"
            );
          } else {
            logger.info(
              { sandbox: existing.toLogJSON() },
              "Woke sleeping sandbox"
            );
            break;
          }
        }
        // Falls through to recreation when wake fails.

        case "deleted": {
          const createResult = await provider.create({});
          if (createResult.isErr()) {
            return createResult;
          }
          await existing.update({ providerId: createResult.value.providerId });
          freshlyCreated = true;
          logger.info(
            {
              sandbox: existing.toLogJSON(),
              newProviderId: createResult.value.providerId,
            },
            "Recreated sandbox from deleted state"
          );
          break;
        }

        default:
          assertNever(status);
      }

      await existing.updateStatus("running");
      await existing.updateLastActivityAt();
      return new Ok({ sandbox: existing, freshlyCreated });
    });
  }

  /**
   * Sleep a running sandbox for the given conversation. Acquires the lifecycle
   * lock, re-fetches the sandbox inside it, and only sleeps if still running.
   * If the provider reports the sandbox as gone, marks it deleted instead.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslySleepIfRunning(
    conversationId: string
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversationId, async (provider) => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversationId(conversationId);
      if (!sandbox || sandbox.status !== "running") {
        return new Ok(undefined);
      }

      const result = await provider.sleep(sandbox.providerId);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Sandbox not found at provider during sleep — marking deleted."
          );
          await sandbox.updateStatus("deleted");
          return new Ok(undefined);
        }
        return result;
      }

      await sandbox.updateStatus("sleeping");
      logger.info({ sandbox: sandbox.toLogJSON() }, "Sandbox put to sleep.");
      return new Ok(undefined);
    });
  }

  /**
   * Destroy a sleeping sandbox for the given conversation. Acquires the
   * lifecycle lock, re-fetches the sandbox inside it, and only destroys if
   * still sleeping. If the provider reports the sandbox as gone, marks it
   * deleted anyway.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyDestroyIfSleeping(
    conversationId: string
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversationId, async (provider) => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversationId(conversationId);
      if (!sandbox || sandbox.status !== "sleeping") {
        return new Ok(undefined);
      }

      const result = await provider.destroy(sandbox.providerId);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Sandbox not found at provider during destroy — marking deleted."
          );
          await sandbox.updateStatus("deleted");
          return new Ok(undefined);
        }
        return result;
      }

      await sandbox.updateStatus("deleted");
      logger.info({ sandbox: sandbox.toLogJSON() }, "Sandbox destroyed.");
      return new Ok(undefined);
    });
  }

  /**
   * Execute a command in this sandbox.
   */
  async exec(
    auth: Authenticator,
    command: string,
    opts?: ExecOptions
  ): Promise<Result<ExecResult, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    const result = await provider.exec(this.providerId, command, opts);

    if (result.isErr() && result.error instanceof SandboxNotFoundError) {
      logger.error(
        { sandbox: this.toLogJSON() },
        "Sandbox not found at provider during exec — marking as deleted"
      );
      await this.updateStatus("deleted");
    }

    return result;
  }

  toLogJSON() {
    return {
      id: this.sId,
      workspaceId: this.workspaceId,
      conversationId: this.conversationId,
      providerId: this.providerId,
      status: this.status,
      lastActivityAt: this.lastActivityAt.toISOString(),
    };
  }
}
