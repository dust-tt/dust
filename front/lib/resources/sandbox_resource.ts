import { getSandboxProvider } from "@app/lib/api/sandbox";
import { revokeAllExecTokensForSandbox } from "@app/lib/api/sandbox/access_tokens";
import { deleteSandboxPolicy } from "@app/lib/api/sandbox/egress_policy";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import {
  recordLifecycleOperation,
  recordStateDuration,
} from "@app/lib/api/sandbox/instrumentation";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  RootExecOptions,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";
import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { SANDBOX_TRUST_ENV_VARS } from "@app/lib/api/sandbox/trust_env";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import {
  ConversationSandboxModel,
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

export interface EnsureSandboxResult {
  freshlyCreated: boolean;
  sandbox: SandboxResource;
  wokeFromSleep: boolean;
}

export type ConversationSandboxOwner = Pick<
  ConversationWithoutContentType,
  "id" | "sId"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxResource extends ReadonlyAttributesType<SandboxModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxResource extends BaseResource<SandboxModel> {
  static model: ModelStaticWorkspaceAware<SandboxModel> = SandboxModel;
  private static conversationSandboxModel: ModelStaticWorkspaceAware<ConversationSandboxModel> =
    ConversationSandboxModel;
  private static sandboxOwnerModel: ModelStaticWorkspaceAware<SandboxOwnerModel> =
    SandboxOwnerModel;

  private static deleteEgressPolicyAfterDestroy(
    sandbox: SandboxResource
  ): void {
    void deleteSandboxPolicy(sandbox.providerId).catch((err) =>
      logger.warn(
        {
          err,
          sandboxId: sandbox.sId,
          sandboxProviderId: sandbox.providerId,
        },
        "Failed to delete sandbox egress policy"
      )
    );
  }

  private static async finalizeDestroyed(
    sandbox: SandboxResource,
    ctx: { workspaceId: string },
    opts: { recordLifecycle: boolean }
  ): Promise<void> {
    await sandbox.updateStatus("deleted", { ctx });
    SandboxResource.deleteEgressPolicyAfterDestroy(sandbox);
    if (opts.recordLifecycle) {
      recordLifecycleOperation("destroy", ctx);
    }
  }

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
      baseImage: string;
      version: string;
    },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const now = new Date();
    const workspaceId = auth.getNonNullableWorkspace().id;

    const createSandbox = async (t: Transaction) => {
      const sandbox = await this.model.create(
        {
          ...blob,
          workspaceId,
          lastActivityAt: now,
          statusChangedAt: now,
        },
        { transaction: t }
      );

      await ConversationSandboxModel.create(
        {
          workspaceId,
          conversationId: blob.conversationId,
          sandboxId: sandbox.id,
        },
        { transaction: t }
      );

      await SandboxOwnerModel.create(
        {
          workspaceId,
          conversationId: blob.conversationId,
          sandboxId: sandbox.id,
        },
        { transaction: t }
      );

      return sandbox;
    };

    const sandbox = await withTransaction(createSandbox, transaction);

    recordLifecycleOperation("create", {
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

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
   * Return sandboxes with the given `status` whose `lastActivityAt` is older
   * than `olderThanMs`. Used by the reaper workflow to identify candidates for
   * sleep/destroy.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyGetStaleSandboxes(opts: {
    status: SandboxStatus;
    olderThanMs: number;
    limit: number;
  }): Promise<SandboxResource[]> {
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        status: opts.status,
        lastActivityAt: {
          [Op.lt]: new Date(Date.now() - opts.olderThanMs),
        },
      },
      order: [["lastActivityAt", "ASC"]],
      limit: opts.limit,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  /**
   * Fetch the sandbox for a conversation without an Authenticator. Only used by
   * the reaper inside the lifecycle lock. Every query remains scoped to the
   * conversation workspace.
   */
  private static async dangerouslyFetchByConversation(
    conversation: ConversationResource
  ): Promise<SandboxResource | null> {
    const owner = await this.sandboxOwnerModel.findOne({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
    });

    const link =
      owner ??
      (await this.conversationSandboxModel.findOne({
        where: {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
        },
      }));

    if (link) {
      const sandbox = await this.model.findOne({
        where: {
          id: link.sandboxId,
          workspaceId: conversation.workspaceId,
        },
      });

      if (sandbox) {
        return new this(this.model, sandbox.get());
      }
    }

    return null;
  }

  static async fetchByConversation(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<SandboxResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const owner = await this.sandboxOwnerModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId,
      },
    });

    const link =
      owner ??
      (await this.conversationSandboxModel.findOne({
        where: {
          conversationId: conversation.id,
          workspaceId,
        },
      }));

    if (link) {
      const sandboxes = await this.baseFetch(auth, {
        where: {
          id: link.sandboxId,
        },
      });

      if (sandboxes[0]) {
        return sandboxes[0];
      }
    }

    return null;
  }

  /**
   * Fetch conversation owners for sandbox rows touched by the reaper. Queries
   * are grouped by workspace so every lookup remains workspace-scoped without
   * issuing unbounded parallel DB queries.
   */
  static async dangerouslyFetchConversationModelIdsBySandboxes(
    sandboxes: Pick<SandboxResource, "id" | "workspaceId">[]
  ): Promise<Map<ModelId, ModelId>> {
    if (sandboxes.length === 0) {
      return new Map();
    }

    const sandboxModelIdsByWorkspaceModelId = new Map<ModelId, ModelId[]>();
    for (const sandbox of sandboxes) {
      const sandboxModelIds =
        sandboxModelIdsByWorkspaceModelId.get(sandbox.workspaceId) ?? [];
      sandboxModelIds.push(sandbox.id);
      sandboxModelIdsByWorkspaceModelId.set(
        sandbox.workspaceId,
        sandboxModelIds
      );
    }

    const conversationModelIdsBySandboxModelId = new Map<ModelId, ModelId>();
    for (const [
      workspaceModelId,
      sandboxModelIds,
    ] of sandboxModelIdsByWorkspaceModelId.entries()) {
      const ownerRows = await this.sandboxOwnerModel.findAll({
        where: {
          workspaceId: workspaceModelId,
          conversationId: {
            [Op.ne]: null,
          },
          sandboxId: {
            [Op.in]: sandboxModelIds,
          },
        },
        attributes: ["sandboxId", "conversationId"],
      });

      const conversationRows = await this.conversationSandboxModel.findAll({
        where: {
          workspaceId: workspaceModelId,
          sandboxId: {
            [Op.in]: sandboxModelIds,
          },
        },
        attributes: ["sandboxId", "conversationId"],
      });

      for (const row of conversationRows) {
        conversationModelIdsBySandboxModelId.set(
          row.sandboxId,
          row.conversationId
        );
      }
      for (const row of ownerRows) {
        if (row.conversationId !== null) {
          conversationModelIdsBySandboxModelId.set(
            row.sandboxId,
            row.conversationId
          );
        }
      }
    }

    return conversationModelIdsBySandboxModelId;
  }

  async updateStatus(
    newStatus: SandboxStatus,
    opts?: {
      ctx?: { workspaceId: string };
      transaction?: Transaction;
    }
  ): Promise<void> {
    const previousStatus = this.status;

    if (previousStatus === newStatus) {
      return;
    }

    if (opts?.ctx && this.statusChangedAt) {
      const durationMs = Date.now() - this.statusChangedAt.getTime();
      recordStateDuration(previousStatus, durationMs, opts.ctx);
    }

    await this.update(
      {
        status: newStatus,
        statusChangedAt: new Date(),
      },
      opts?.transaction
    );
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
    const workspaceId = auth.getNonNullableWorkspace().id;
    const deleteSandbox = async (t: Transaction) => {
      await SandboxOwnerModel.destroy({
        where: {
          sandboxId: this.id,
          workspaceId,
        },
        transaction: t,
      });

      await ConversationSandboxModel.destroy({
        where: {
          sandboxId: this.id,
          workspaceId,
        },
        transaction: t,
      });

      return SandboxModel.destroy({
        where: {
          id: this.id,
          workspaceId,
        },
        transaction: t,
      });
    };

    const deletedCount = await withTransaction(deleteSandbox, transaction);

    return new Ok(deletedCount);
  }

  /**
   * Full cleanup under the lifecycle lock: best-effort destroy at the provider,
   * then delete the DB row.
   */
  static async deleteByConversation(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const sandbox = await SandboxResource.fetchByConversation(
        auth,
        conversation.toJSON()
      );
      if (!sandbox) {
        return new Ok(undefined);
      }

      if (sandbox.status !== "deleted") {
        const tracingOpts = {
          workspaceId: auth.getNonNullableWorkspace().sId,
        };
        const result = await provider.destroy(sandbox.providerId, tracingOpts);
        if (result.isErr() && !(result.error instanceof SandboxNotFoundError)) {
          logger.error(
            { sandbox: sandbox.toLogJSON(), error: result.error.message },
            "Failed to destroy sandbox at provider — proceeding with DB cleanup."
          );
        } else {
          SandboxResource.deleteEgressPolicyAfterDestroy(sandbox);
        }
      }

      await withTransaction(async (transaction) => {
        await SandboxOwnerModel.destroy({
          where: {
            sandboxId: sandbox.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
        });

        await ConversationSandboxModel.destroy({
          where: {
            conversationId: conversation.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
        });

        await SandboxModel.destroy({
          where: {
            id: sandbox.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
        });
      });

      return new Ok(undefined);
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

    return executeWithLock(
      `sandbox:lifecycle:${conversationId}`,
      () => fn(provider),
      undefined,
      { traceAcquireResource: "sandbox:lifecycle" }
    );
  }

  // Compose the env vars passed to provider.create. Precedence (lowest →
  // highest): workspace env vars → image runEnv → system vars. The image and
  // system layers always win, so even if a row slips past suffix validation it
  // cannot shadow a system var like CONVERSATION_ID.
  private static async buildSandboxEnvVars(
    auth: Authenticator,
    conversation: ConversationSandboxOwner,
    imageEnvVars: Record<string, string> | undefined
  ): Promise<Result<Record<string, string>, Error>> {
    const workspaceEnvResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(auth);
    if (workspaceEnvResult.isErr()) {
      return workspaceEnvResult;
    }
    const httpsSecretEnvResult =
      await WorkspaceSandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(auth);
    if (httpsSecretEnvResult.isErr()) {
      return httpsSecretEnvResult;
    }

    // Trust defaults for mainstream HTTPS stacks. Replace-style clients point
    // at the image-seeded bundle; installMitmTrustBundle later rebuilds it as
    // system roots + dsbx CA. Append-style clients point at dsbx's single CA.
    // These are also baked into the image via /etc/environment and
    // /etc/profile.d, but provider env injection covers early non-login
    // processes started directly from the sandbox runtime. The key set is
    // canonical in trust_env.ts so dsbx's `env -u` strip list can't drift.

    return new Ok({
      ...workspaceEnvResult.value,
      ...httpsSecretEnvResult.value,
      ...imageEnvVars,
      ...SANDBOX_TRUST_ENV_VARS,
      CONVERSATION_ID: conversation.sId,
      WORKSPACE_ID: auth.getNonNullableWorkspace().sId,
    });
  }

  /**
   * Ensure a running sandbox exists for the given conversation.
   *
   * The provider is resolved internally — callers never touch it.
   */
  static async ensureActive(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<Result<EnsureSandboxResult, Error>> {
    assert(
      auth.getNonNullableWorkspace().id !== undefined,
      "Cannot ensure sandbox without a workspace"
    );

    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
      const existing = await SandboxResource.fetchByConversation(
        auth,
        conversation
      );

      if (!existing) {
        const imageResult = getSandboxImage(auth);
        if (imageResult.isErr()) {
          return imageResult;
        }

        const createConfig = imageResult.value.toCreateConfig();
        const envVarsResult = await this.buildSandboxEnvVars(
          auth,
          conversation,
          createConfig.envVars
        );
        if (envVarsResult.isErr()) {
          return new Err(envVarsResult.error);
        }

        const createResult = await provider.create(
          {
            ...createConfig,
            envVars: envVarsResult.value,
          },
          tracingOpts
        );
        if (createResult.isErr()) {
          return createResult;
        }

        const sandbox = await SandboxResource.makeNew(auth, {
          conversationId: conversation.id,
          providerId: createResult.value.providerId,
          status: "running",
          baseImage: createConfig.imageId.imageName,
          version: createConfig.imageId.tag,
        });

        logger.info(
          { sandbox: sandbox.toLogJSON() },
          "Created new sandbox for conversation"
        );

        return new Ok({ sandbox, freshlyCreated: true, wokeFromSleep: false });
      }

      let effectiveStatus: SandboxStatus = existing.status;
      let freshlyCreated = false;
      let wokeFromSleep = false;

      // If a kill was requested, destroy the existing sandbox at the provider
      // (best-effort) and fall through to recreation. This races with the
      // reaper's killRequested phase; the lifecycle lock keeps it serialised.
      if (existing.killRequestedAt && existing.status !== "deleted") {
        logger.info(
          { sandbox: existing.toLogJSON() },
          "Sandbox has killRequestedAt — destroying and recreating."
        );
        const destroyResult = await provider.destroy(
          existing.providerId,
          tracingOpts
        );
        if (destroyResult.isErr()) {
          // We swallow SandboxNotFoundError because it just means the sandbox was removed by the provider
          // And we only log if failed to destroy because the sandbox will be eventually removed
          // The most critical part is making sure we go through the "deleted" path
          if (!(destroyResult.error instanceof SandboxNotFoundError)) {
            logger.error(
              {
                sandbox: existing.toLogJSON(),
                error: destroyResult.error.message,
              },
              "Failed to destroy kill-requested sandbox at provider — proceeding with recreation."
            );
          }
        } else {
          SandboxResource.deleteEgressPolicyAfterDestroy(existing);
        }
        effectiveStatus = "deleted";
      }

      switch (effectiveStatus) {
        case "running":
          break;

        case "pending_approval": {
          // The sandbox was paused (betaPause) while waiting for tool approval.
          // Wake it, but do NOT fall through to recreation on failure — the
          // frozen process state and output files are unrecoverable.
          const pendingWakeResult = await provider.wake(
            existing.providerId,
            tracingOpts
          );
          if (pendingWakeResult.isErr()) {
            return new Err(
              new Error(
                `Failed to wake pending_approval sandbox: ${pendingWakeResult.error.message}`
              )
            );
          }
          wokeFromSleep = true;
          break;
        }

        case "sleeping": {
          const wakeResult = await provider.wake(
            existing.providerId,
            tracingOpts
          );
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
            wokeFromSleep = true;

            break;
          }
        }
        // Falls through to recreation when wake fails.

        case "deleted": {
          const imageResult = getSandboxImage(auth);
          if (imageResult.isErr()) {
            return imageResult;
          }

          const createConfig = imageResult.value.toCreateConfig();
          const envVarsResult = await this.buildSandboxEnvVars(
            auth,
            conversation,
            createConfig.envVars
          );
          if (envVarsResult.isErr()) {
            return new Err(envVarsResult.error);
          }

          const createResult = await provider.create(
            {
              ...createConfig,
              envVars: envVarsResult.value,
            },
            tracingOpts
          );
          if (createResult.isErr()) {
            return createResult;
          }
          await existing.update({
            providerId: createResult.value.providerId,
            baseImage: createConfig.imageId.imageName,
            version: createConfig.imageId.tag,
            killRequestedAt: null,
          });
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
          assertNever(effectiveStatus);
      }

      await existing.updateStatus("running", { ctx });
      await existing.updateLastActivityAt();

      if (wokeFromSleep) {
        recordLifecycleOperation("wake", ctx);
      } else if (freshlyCreated) {
        recordLifecycleOperation("create", ctx);
      }

      return new Ok({ sandbox: existing, freshlyCreated, wokeFromSleep });
    });
  }

  /**
   * Sleep a running sandbox for the given conversation. Acquires the lifecycle
   * lock, re-fetches the sandbox inside it, and only sleeps if still running.
   * If the provider reports the sandbox as gone, marks it deleted instead.
   */
  static async dangerouslySleepIfRunning(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversation(conversation);
      if (!sandbox || sandbox.status !== "running") {
        return new Ok(undefined);
      }

      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      const result = await provider.sleep(sandbox.providerId, tracingOpts);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Sandbox not found at provider during sleep — marking deleted."
          );
          await sandbox.updateStatus("deleted", { ctx });
          return new Ok(undefined);
        }
        return result;
      }

      await sandbox.updateStatus("sleeping", { ctx });
      recordLifecycleOperation("sleep", ctx);
      logger.info({ sandbox: sandbox.toLogJSON() }, "Sandbox put to sleep.");
      return new Ok(undefined);
    });
  }

  /**
   * Pause a running sandbox for tool approval. Calls sleep() on the
   * provider and sets the status to `pending_approval`. Unlike sleep, this
   * status prevents recreation on wake failure (frozen state is unrecoverable).
   */
  static async pauseForApproval(
    auth: Authenticator,
    conversation: ConversationSandboxOwner
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const sandbox = await SandboxResource.fetchByConversation(
        auth,
        conversation
      );
      if (!sandbox || sandbox.status !== "running") {
        return new Ok(undefined);
      }

      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };

      // Flip the DB to `pending_approval` BEFORE the provider sleep.
      // If we slept first and the DB update then failed, we'd be stuck with
      // a frozen SDK sandbox and a DB row saying "running" — ensureActive's
      // `running` branch would skip wake-up and subsequent execs would hang
      // against the frozen sandbox indefinitely. With DB first, a sleep
      // failure leaves DB=pending_approval + SDK=running, which is the
      // recoverable shape: ensureActive's pending_approval branch will wake
      // the (still-running) sandbox on the next call, idempotently.
      await sandbox.updateStatus("pending_approval", { ctx });

      const sleepResult = await provider.sleep(sandbox.providerId, ctx);
      if (sleepResult.isErr()) {
        logger.error(
          {
            sandbox: sandbox.toLogJSON(),
            err: sleepResult.error,
          },
          "Provider sleep failed after pending_approval DB update — sandbox left in recoverable pending_approval state."
        );
        return sleepResult;
      }

      logger.info(
        { sandbox: sandbox.toLogJSON() },
        "Sandbox paused for tool approval."
      );
      return new Ok(undefined);
    });
  }

  /**
   * Transition a pending_approval sandbox to sleeping. The sandbox is already
   * paused via betaPause(), so no provider call is needed — we just update the
   * DB status so the regular destroy phase can reap it later.
   */
  static async dangerouslySleepIfPendingApproval(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async () => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversation(conversation);
      if (!sandbox || sandbox.status !== "pending_approval") {
        return new Ok(undefined);
      }

      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
      await sandbox.updateStatus("sleeping", { ctx });
      logger.info(
        { sandbox: sandbox.toLogJSON() },
        "Pending-approval sandbox transitioned to sleeping."
      );
      return new Ok(undefined);
    });
  }

  /**
   * Destroy a sleeping sandbox for the given conversation. Acquires the
   * lifecycle lock, re-fetches the sandbox inside it, and only destroys if
   * still sleeping. If the provider reports the sandbox as gone, marks it
   * deleted anyway.
   */
  static async dangerouslyDestroyIfSleeping(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversation(conversation);
      if (!sandbox || sandbox.status !== "sleeping") {
        return new Ok(undefined);
      }

      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      const result = await provider.destroy(sandbox.providerId, tracingOpts);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Sandbox not found at provider during destroy — marking deleted."
          );
          await SandboxResource.finalizeDestroyed(sandbox, ctx, {
            recordLifecycle: false,
          });
          return new Ok(undefined);
        }
        return result;
      }

      await SandboxResource.finalizeDestroyed(sandbox, ctx, {
        recordLifecycle: true,
      });

      void revokeAllExecTokensForSandbox(sandbox.sId).catch((err) =>
        logger.error(
          { error: err },
          "Failed to revoke exec tokens on sandbox destroy"
        )
      );

      logger.info({ sandbox: sandbox.toLogJSON() }, "Sandbox destroyed.");
      return new Ok(undefined);
    });
  }

  /**
   * Mark up to `limit` non-deleted sandboxes for the given `baseImage` (and,
   * when `version` is set, any version different from it) with
   * `killRequestedAt = now()`. Rows already marked are skipped. Returns the
   * count of rows updated.
   *
   * WORKSPACE_ISOLATION_BYPASS: image rollouts span all workspaces.
   */
  static async dangerouslyRequestKillForBaseImage(opts: {
    baseImage: string;
    version?: string;
    limit: number;
  }): Promise<number> {
    const versionClause =
      opts.version !== undefined
        ? {
            [Op.or]: [
              { version: { [Op.is]: null } },
              { version: { [Op.ne]: opts.version } },
            ],
          }
        : {};

    const candidates = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      attributes: ["id"],
      where: {
        baseImage: opts.baseImage,
        status: { [Op.ne]: "deleted" },
        killRequestedAt: { [Op.is]: null },
        ...versionClause,
      },
      limit: opts.limit,
    });

    if (candidates.length === 0) {
      return 0;
    }

    const ids = candidates.map((c) => c.id);
    const [affectedCount] = await this.model.update(
      { killRequestedAt: new Date() },
      {
        where: {
          id: { [Op.in]: ids },
          killRequestedAt: { [Op.is]: null },
        },
      }
    );
    return affectedCount;
  }

  /**
   * Return sandboxes with `killRequestedAt` set and not yet deleted. The
   * kill-requester workflow marks rows; the reaper (and the bash path) is
   * responsible for actually destroying them.
   *
   * WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyGetKillRequestedSandboxes(opts: {
    limit: number;
  }): Promise<SandboxResource[]> {
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        killRequestedAt: { [Op.ne]: null },
        status: { [Op.ne]: "deleted" },
      },
      order: [["killRequestedAt", "ASC"]],
      limit: opts.limit,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  /**
   * Destroy a sandbox that has a kill request set, regardless of its current
   * status. Acquires the lifecycle lock, re-fetches the sandbox, and only
   * destroys if it is non-deleted and still has `killRequestedAt`. Treats
   * `SandboxNotFoundError` as success.
   */
  static async dangerouslyDestroyIfKillRequested(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(conversation.sId, async (provider) => {
      const sandbox =
        await SandboxResource.dangerouslyFetchByConversation(conversation);
      if (
        !sandbox ||
        sandbox.status === "deleted" ||
        !sandbox.killRequestedAt
      ) {
        return new Ok(undefined);
      }

      const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      const result = await provider.destroy(sandbox.providerId, tracingOpts);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Kill-requested sandbox not found at provider — marking deleted."
          );
          await SandboxResource.finalizeDestroyed(sandbox, ctx, {
            recordLifecycle: false,
          });
          return new Ok(undefined);
        }
        return result;
      }

      await SandboxResource.finalizeDestroyed(sandbox, ctx, {
        recordLifecycle: true,
      });

      void revokeAllExecTokensForSandbox(sandbox.sId).catch((err) =>
        logger.error(
          { error: err },
          "Failed to revoke exec tokens on kill-requested sandbox destroy"
        )
      );

      logger.info(
        { sandbox: sandbox.toLogJSON() },
        "Kill-requested sandbox destroyed."
      );
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

    const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
    const result = await provider.exec(
      this.providerId,
      command,
      opts,
      tracingOpts
    );

    if (result.isErr() && result.error instanceof SandboxNotFoundError) {
      logger.error(
        { sandbox: this.toLogJSON() },
        "Sandbox not found at provider during exec — marking as deleted"
      );
      await this.updateStatus("deleted");
    }

    return result;
  }

  /**
   * Execute a privileged command in this sandbox.
   *
   * Root commands must be built as RootCommand so callers cannot accidentally
   * pass raw shell strings through the generic exec path.
   */
  async execRoot(
    auth: Authenticator,
    command: RootCommand,
    opts?: RootExecOptions
  ): Promise<Result<ExecResult, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
    const result = await provider.execRoot(
      this.providerId,
      command,
      opts,
      tracingOpts
    );

    if (result.isErr() && result.error instanceof SandboxNotFoundError) {
      logger.error(
        { sandbox: this.toLogJSON() },
        "Sandbox not found at provider during root exec — marking as deleted"
      );
      await this.updateStatus("deleted");
    }

    return result;
  }

  /**
   * List files in a directory on this sandbox.
   */
  async listFiles(
    auth: Authenticator,
    path: string,
    opts?: { recursive?: boolean }
  ): Promise<Result<FileEntry[], Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    try {
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
      const entries = await provider.listFiles(
        this.providerId,
        path,
        opts,
        tracingOpts
      );
      return new Ok(entries);
    } catch (err) {
      if (err instanceof SandboxNotFoundError) {
        logger.error(
          { sandbox: this.toLogJSON() },
          "Sandbox not found at provider during listFiles — marking as deleted"
        );
        await this.updateStatus("deleted");
      }
      return new Err(normalizeError(err));
    }
  }

  /**
   * Write a file to the sandbox filesystem.
   */
  async writeFile(
    auth: Authenticator,
    path: string,
    data: ArrayBuffer
  ): Promise<Result<void, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
    const result = await provider.writeFile(
      this.providerId,
      path,
      data,
      tracingOpts
    );

    if (result.isErr() && result.error instanceof SandboxNotFoundError) {
      logger.error(
        { sandbox: this.toLogJSON() },
        "Sandbox not found at provider during writeFile — marking as deleted"
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
      baseImage: this.baseImage,
      version: this.version,
      killRequestedAt: this.killRequestedAt?.toISOString() ?? null,
    };
  }
}
