import { getSandboxProvider } from "@app/lib/api/sandbox";
import { revokeAllExecTokensForSandbox } from "@app/lib/api/sandbox/access_tokens";
import { deleteLegacySandboxPolicy } from "@app/lib/api/sandbox/egress_policy";
import { SandboxNotRunningError } from "@app/lib/api/sandbox/errors";
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
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import {
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { PokeSandboxType } from "@app/types/poke";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { col, fn, Op, where } from "sequelize";

export interface EnsureSandboxResult<TScope = undefined> {
  freshlyCreated: boolean;
  sandbox: SandboxResource;
  wokeFromSleep: boolean;
  // Owner scope resolved inside the lifecycle lock (see
  // SandboxCreateOwner.resolveScope). Callers must derive every
  // scope-dependent input (egress claims, mounts, runtime owner) from this,
  // never from state read before the lock.
  scope: TScope;
}

export type SandboxCreateBlob = {
  providerId: string;
  status: SandboxStatus;
  baseImage: string;
  version: string;
};

export type SandboxLifecycleOwner = {
  lockKey: string;
  // Must return a sandbox scoped to the same workspace as the Authenticator
  // passed to the lifecycle operation.
  fetchSandbox: () => Promise<SandboxResource | null>;
};

// Health check run under the lifecycle lock on a still-running sandbox,
// before the provider pause/destroy. Ok means the sandbox's durable state is
// safely flushed. Whether an Err blocks the operation — and how it is logged
// — is decided per lifecycle entry point.
export type SandboxPreSleepCheck = (
  sandbox: SandboxResource
) => Promise<Result<void, Error>>;

type SandboxCreateOwner<TScope> = SandboxLifecycleOwner & {
  createSandbox: (blob: SandboxCreateBlob) => Promise<SandboxResource>;
  // Resolves the owner's authorization scope (e.g. a conversation's current
  // pod association). Runs as the first step INSIDE the lifecycle lock so a
  // scope transition (a move's destroy + spaceId change, which holds the
  // same lock) can never interleave between the read and the create/wake it
  // parameterizes. Owners with immutable scope return a constant.
  resolveScope: () => Promise<Result<TScope, Error>>;
  // Owner env vars are only consumed when a sandbox is actually created.
  // Owners whose env requires DB reads (e.g. pod env vars) should pass the
  // factory form so ensureActive calls on an already-running sandbox don't
  // pay for loads that would be discarded. The factory receives the
  // lock-resolved scope.
  envVars:
    | Record<string, string>
    | ((scope: TScope) => Promise<Result<Record<string, string>, Error>>);
  logLabel: string;
};

export type SandboxTimestampCursor = {
  sandboxModelId: ModelId;
  timestamp: Date;
};

type KillRequestedSandboxesOrder = "killRequestedAtAsc" | "lastActivityAtDesc";

export type SandboxDeleteOwner = SandboxLifecycleOwner & {
  deleteSandbox: (
    sandbox: SandboxResource,
    transaction: Transaction
  ) => Promise<void>;
};

// Activity writes are throttled to this granularity; the reaper's inactivity
// thresholds are minutes-scale, so a lastActivityAt up to 30s stale is
// indistinguishable to it.
// How long an acquired lifecycle lock stays valid. Must comfortably exceed
// the slowest operation performed under it (provider create/wake and, for
// scope transitions, provider destroy + the database move) — if the lease
// expires mid-operation, a concurrent ensure or move can acquire the lock
// and the scope-serialization guarantee is gone. The cost of a generous TTL
// is that a crashed holder strands the lock for up to this long; waiters
// give up at executeWithLock's 30s acquisition timeout well before that,
// and the kill-requested recovery self-heals once the lease expires. That
// trade is deliberate: a heartbeat-renewed lease would shrink the stranding
// window, but the machinery it needs (an extend loop, abort semantics for
// a lost lease mid-operation) is only worth building if crash-stranded
// locks show up in practice — a rare event with a bounded,
// one-conversation blast radius.
const SANDBOX_LIFECYCLE_LOCK_TTL_MS = 5 * 60 * 1000;

const LAST_ACTIVITY_WRITE_INTERVAL_MS = 30_000;

// How long a kill-requested sandbox may keep failing its pre-destroy flush
// before the destroy proceeds anyway. The flush is best-effort durability, not
// a precondition: a sandbox whose state cannot be replicated (e.g. a database
// file the litestream user cannot write) fails the check identically on every
// sweep, and without a deadline it pins a running VM and blocks the image
// rollout forever. Generous enough that a transient GCS or daemon hiccup still
// resolves on a later sweep — the reaper sweeps every 5 minutes.
const KILL_REQUESTED_FLUSH_GRACE_MS = 60 * 60 * 1000;

// Owner identity env vars are reserved for owner adapters. SandboxResource
// only enforces the env contract and does not interpret owner types.
const SANDBOX_OWNER_ENV_VAR_CONTRACT_NAMES = new Set([
  "CONVERSATION_ID",
  "SPACE_ID",
]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxResource extends ReadonlyAttributesType<SandboxModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxResource extends BaseResource<SandboxModel> {
  static model: ModelStaticWorkspaceAware<SandboxModel> = SandboxModel;

  // Owner policy files (w/{wId}/sandboxes/{ownerId}.json) intentionally
  // survive sandbox destruction; only the legacy per-providerId file is
  // scrubbed here. Owner files are deleted with their owner (conversation
  // destruction, pod space deletion).
  private static deleteEgressPolicyAfterDestroy(
    sandbox: SandboxResource
  ): void {
    void deleteLegacySandboxPolicy(sandbox.providerId).catch((err) =>
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

  // No-op when there is no check or the sandbox is not running — a sleeping
  // or pending_approval sandbox already passed the check when it paused.
  private static async runPreSleepCheck(
    beforeSleep: SandboxPreSleepCheck | undefined,
    sandbox: SandboxResource
  ): Promise<Result<void, Error>> {
    if (!beforeSleep || sandbox.status !== "running") {
      return new Ok(undefined);
    }
    return beforeSleep(sandbox);
  }

  private static async finalizeDestroyed(
    sandbox: SandboxResource,
    opts: { recordLifecycle: boolean }
  ): Promise<void> {
    await sandbox.updateStatus("deleted");
    SandboxResource.deleteEgressPolicyAfterDestroy(sandbox);
    if (opts.recordLifecycle) {
      recordLifecycleOperation("destroy");
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

  static async fetchByModelIdForWorkspace(
    auth: Authenticator,
    sandboxModelId: ModelId
  ): Promise<SandboxResource | null> {
    return this.dangerouslyFetchByModelIdForWorkspace({
      sandboxModelId,
      workspaceModelId: auth.getNonNullableWorkspace().id,
    });
  }

  static async dangerouslyFetchByModelIdForWorkspace({
    sandboxModelId,
    workspaceModelId,
  }: {
    sandboxModelId: ModelId;
    workspaceModelId: ModelId;
  }): Promise<SandboxResource | null> {
    const sandbox = await this.model.findOne({
      where: {
        id: sandboxModelId,
        workspaceId: workspaceModelId,
      },
    });

    return sandbox ? new this(this.model, sandbox.get()) : null;
  }

  static async makeNew(
    auth: Authenticator,
    blob: SandboxCreateBlob,
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

      return sandbox;
    };

    const sandbox = await withTransaction(createSandbox, transaction);

    recordLifecycleOperation("create");

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
   * than `olderThanMs` and which do not have a pending kill request. Used by
   * the reaper workflow to identify candidates for the regular sleep/destroy
   * phases; kill-requested sandboxes are handled by their dedicated phase.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyGetStaleSandboxes(opts: {
    status: SandboxStatus;
    olderThanMs: number;
    limit: number;
    after?: SandboxTimestampCursor;
  }): Promise<SandboxResource[]> {
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        status: opts.status,
        killRequestedAt: { [Op.is]: null },
        lastActivityAt: {
          [Op.lt]: new Date(Date.now() - opts.olderThanMs),
        },
        ...(opts.after && {
          [Op.and]: where(
            fn("ROW", col("lastActivityAt"), col("id")),
            Op.gt,
            fn("ROW", opts.after.timestamp, opts.after.sandboxModelId)
          ),
        }),
      },
      order: [
        ["lastActivityAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: opts.limit,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  async updateStatus(
    newStatus: SandboxStatus,
    opts?: {
      transaction?: Transaction;
    }
  ): Promise<void> {
    const previousStatus = this.status;

    if (previousStatus === newStatus) {
      return;
    }

    if (this.statusChangedAt) {
      const durationMs = Date.now() - this.statusChangedAt.getTime();
      recordStateDuration(previousStatus, durationMs);
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
    // Throttled: every operation on a busy sandbox calls this, which makes the sandbox row a
    // hot write under concurrent invocations. The reaper compares lastActivityAt against
    // inactivity thresholds measured in minutes, so a value up to 30s stale changes nothing.
    const lastActivityAtMs = this.lastActivityAt?.getTime() ?? 0;
    if (Date.now() - lastActivityAtMs < LAST_ACTIVITY_WRITE_INTERVAL_MS) {
      return [0];
    }
    return this.update({ lastActivityAt: new Date() }, transaction);
  }

  async updateLastRuntimeRefreshAt(
    lastRuntimeRefreshAt: Date | null
  ): Promise<[affectedCount: number]> {
    return this.update({ lastRuntimeRefreshAt });
  }

  /**
   * Mark this sandbox for destruction: the reaper's kill sweep destroys it,
   * and ensureActive's kill-requested branch destroys-and-recreates it on the
   * next access. Used when runtime bring-up left the sandbox half-initialized
   * (e.g. pod-state restore failed after status=running was committed), so
   * the failure self-heals through a fresh cold start instead of the warm
   * path silently serving a broken sandbox.
   */
  async requestKill(): Promise<void> {
    await this.update({ killRequestedAt: new Date() });
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
   * then delete the owner link and DB row.
   */
  static async deleteByOwner(
    auth: Authenticator,
    owner: SandboxDeleteOwner
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const sandbox = await owner.fetchSandbox();
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
        await owner.deleteSandbox(sandbox, transaction);
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
    lockKey: string,
    fn: (provider: SandboxProvider) => Promise<Result<T, Error>>
  ): Promise<Result<T, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    return executeWithLock(
      `sandbox:lifecycle:${lockKey}`,
      () => fn(provider),
      undefined,
      {
        traceAcquireResource: "sandbox:lifecycle",
        lockTtlMs: SANDBOX_LIFECYCLE_LOCK_TTL_MS,
        // Contended by concurrent invocations of the same pod: transitions
        // hold this lock from milliseconds (status checks) to seconds
        // (wake/create), and waiters on the fast side of that range should
        // not lose in 100ms quanta.
        retryIntervalMs: 25,
      }
    );
  }

  // Owner env vars come either as a plain record or as a factory for owners
  // whose env requires DB reads — the factory only runs on the create paths,
  // so ensure calls on an already-running sandbox pay nothing.
  private static async resolveOwnerEnvVars<TScope>(
    owner: SandboxCreateOwner<TScope>,
    scope: TScope
  ): Promise<Result<Record<string, string>, Error>> {
    return typeof owner.envVars === "function"
      ? owner.envVars(scope)
      : new Ok(owner.envVars);
  }

  // Compose the env vars passed to provider.create. Precedence (lowest →
  // highest): workspace env vars → image runEnv → owner vars → system vars.
  // Owner and system layers always win, so even if a row slips past suffix
  // validation it cannot shadow owner/system vars like CONVERSATION_ID or
  // WORKSPACE_ID.
  private static async buildSandboxEnvVars(
    auth: Authenticator,
    ownerEnvVars: Record<string, string>,
    imageEnvVars: Record<string, string> | undefined
  ): Promise<Result<Record<string, string>, Error>> {
    const workspaceScope = {
      kind: "workspace" as const,
      workspace: auth.getNonNullableWorkspace(),
    };
    const workspaceEnvResult = await SandboxEnvVarResource.loadEnv(
      auth,
      workspaceScope
    );
    if (workspaceEnvResult.isErr()) {
      return workspaceEnvResult;
    }
    const httpsSecretEnvResult =
      await SandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        auth,
        workspaceScope
      );
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

    const envVars = {
      ...workspaceEnvResult.value,
      ...httpsSecretEnvResult.value,
      ...imageEnvVars,
      ...SANDBOX_TRUST_ENV_VARS,
    };
    const scopedEnvVars = Object.fromEntries(
      Object.entries(envVars).filter(
        ([name]) =>
          !SANDBOX_OWNER_ENV_VAR_CONTRACT_NAMES.has(name) ||
          name in ownerEnvVars
      )
    );

    return new Ok({
      ...scopedEnvVars,
      ...ownerEnvVars,
      WORKSPACE_ID: auth.getNonNullableWorkspace().sId,
    });
  }

  /**
   * Ensure a running sandbox exists for the given owner.
   *
   * The provider is resolved internally — callers never touch it.
   *
   * `opts.beforeSleep` runs best-effort before the kill-requested
   * destroy-and-recreate of a still-running sandbox: a failure is logged and
   * recreation proceeds.
   */
  static async ensureActive<TScope = undefined>(
    auth: Authenticator,
    owner: SandboxCreateOwner<TScope>,
    opts: {
      beforeSleep?: SandboxPreSleepCheck;
      // Use the sandbox only if it is already running: do not create, wake, or recreate one.
      // Creating and waking take seconds to minutes, which a caller running inside a request
      // cannot wait for.
      requireRunning?: boolean;
    } = {}
  ): Promise<Result<EnsureSandboxResult<TScope>, Error>> {
    assert(
      auth.getNonNullableWorkspace().id !== undefined,
      "Cannot ensure sandbox without a workspace"
    );

    // Lock-free fast path: `requireRunning` never creates, wakes, or recreates, so a running,
    // not-kill-requested sandbox can be used off a plain read. The lock exists to serialize
    // lifecycle transitions, and this path performs none; taking it here made every concurrent
    // invocation of a busy pod queue behind a blind-polling Redis lock for work that reads two
    // rows.
    //
    // The read is a snapshot, so a concurrent kill or sleep can invalidate the sandbox between
    // this check and the caller's exec. That race is accepted, not converged: the exec fails
    // with a provider error and the invocation fails (escalation to the durable path only
    // happens on SandboxNotRunningError, and escalating on an arbitrary exec failure would risk
    // re-running a function that partially executed). The lock never protected running execs —
    // it only serialized admission — so an exec racing a sleep's pre-pause flush was already
    // possible for any exec admitted before the reaper took the lock; this path widens
    // admission into that window but does not create it. Both windows need the reaper to pick
    // an actively-used pod, which the activity touch below makes minutes-rare.
    //
    // A sandbox that is NOT running never takes the fast path: the error return below preserves
    // requireRunning's contract without touching the lock, since waiting behind an in-flight
    // multi-second wake would defeat the caller's latency bound anyway.
    if (opts.requireRunning) {
      const existing = await owner.fetchSandbox();
      if (
        !existing ||
        existing.killRequestedAt !== null ||
        existing.status !== "running"
      ) {
        return new Err(new SandboxNotRunningError());
      }
      // Same touch the locked path performs, so the reaper's inactivity clock keeps running for
      // sandboxes served entirely through the fast path. Throttled internally to one write/30s.
      await existing.updateLastActivityAt();
      // Resolved outside the lock: this path never creates, wakes, or mints,
      // so the scope parameterizes nothing lifecycle-ordered. requireRunning
      // callers must therefore have lock-independent (immutable) scope.
      const fastPathScopeResult = await owner.resolveScope();
      if (fastPathScopeResult.isErr()) {
        return fastPathScopeResult;
      }
      return new Ok({
        sandbox: existing,
        freshlyCreated: false,
        wokeFromSleep: false,
        scope: fastPathScopeResult.value,
      });
    }

    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };
      // First thing under the lock: a scope transition holds this same lock,
      // so everything derived from here cannot be invalidated by a
      // concurrent move.
      const scopeResult = await owner.resolveScope();
      if (scopeResult.isErr()) {
        return scopeResult;
      }
      const scope = scopeResult.value;

      const existing = await owner.fetchSandbox();

      if (!existing) {
        const imageResult = getSandboxImage(auth);
        if (imageResult.isErr()) {
          return imageResult;
        }

        const createConfig = imageResult.value.toCreateConfig();
        const ownerEnvVarsResult = await this.resolveOwnerEnvVars(owner, scope);
        if (ownerEnvVarsResult.isErr()) {
          return ownerEnvVarsResult;
        }

        const envVarsResult = await this.buildSandboxEnvVars(
          auth,
          ownerEnvVarsResult.value,
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

        const sandbox = await owner.createSandbox({
          providerId: createResult.value.providerId,
          status: "running",
          baseImage: createConfig.imageId.imageName,
          version: createConfig.imageId.tag,
        });

        logger.info(
          { owner: owner.logLabel, sandbox: sandbox.toLogJSON() },
          "Created new sandbox for owner"
        );

        return new Ok({
          sandbox,
          freshlyCreated: true,
          wokeFromSleep: false,
          scope,
        });
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
        // Best-effort pre-destroy flush. Unlike the reaper's kill sweep this
        // PROCEEDS on failure: this branch is the user-facing
        // recovery/rollout path, and refusing to recreate would wedge the pod
        // behind the very failure (e.g. a dead replica mount) the recreation
        // fixes.
        const flushResult = await this.runPreSleepCheck(
          opts.beforeSleep,
          existing
        );
        if (flushResult.isErr()) {
          logger.error(
            { sandbox: existing.toLogJSON(), err: flushResult.error },
            "Pre-destroy health check failed on kill-requested sandbox — proceeding with recreation."
          );
        }
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
          const ownerEnvVarsResult = await this.resolveOwnerEnvVars(
            owner,
            scope
          );
          if (ownerEnvVarsResult.isErr()) {
            return ownerEnvVarsResult;
          }

          const envVarsResult = await this.buildSandboxEnvVars(
            auth,
            ownerEnvVarsResult.value,
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
            lastRuntimeRefreshAt: null,
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

      if (wokeFromSleep) {
        await existing.updateLastRuntimeRefreshAt(null);
      }

      await existing.updateStatus("running");
      await existing.updateLastActivityAt();

      if (wokeFromSleep) {
        recordLifecycleOperation("wake");
      } else if (freshlyCreated) {
        recordLifecycleOperation("create");
      }

      return new Ok({
        sandbox: existing,
        freshlyCreated,
        wokeFromSleep,
        scope,
      });
    });
  }

  /**
   * Sleep a running sandbox for the given owner. Acquires the lifecycle lock,
   * re-fetches the sandbox inside it, and only sleeps if still running. If the
   * provider reports the sandbox as gone, marks it deleted instead.
   *
   * An `opts.beforeSleep` Err aborts the sleep: status stays `running`, so
   * the reaper retries the check on its next cycle instead of pausing a
   * sandbox with unreplicated state.
   */
  static async dangerouslySleepIfRunning(
    auth: Authenticator,
    owner: SandboxLifecycleOwner,
    opts: { beforeSleep?: SandboxPreSleepCheck } = {}
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const sandbox = await owner.fetchSandbox();
      if (!sandbox || sandbox.status !== "running") {
        return new Ok(undefined);
      }

      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      const checkResult = await this.runPreSleepCheck(
        opts.beforeSleep,
        sandbox
      );
      if (checkResult.isErr()) {
        // Status stays `running`, so the reaper retries the check on its next
        // cycle instead of pausing a sandbox with unreplicated state.
        logger.error(
          { sandbox: sandbox.toLogJSON(), err: checkResult.error },
          "Sandbox pre-sleep health check failed — not sleeping."
        );
        return checkResult;
      }

      const result = await provider.sleep(sandbox.providerId, tracingOpts);
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
      recordLifecycleOperation("sleep");
      logger.info({ sandbox: sandbox.toLogJSON() }, "Sandbox put to sleep.");
      return new Ok(undefined);
    });
  }

  /**
   * Pause a running sandbox for tool approval. Calls sleep() on the
   * provider and sets the status to `pending_approval`. Unlike sleep, this
   * status prevents recreation on wake failure (frozen state is unrecoverable).
   *
   * An `opts.beforeSleep` Err aborts the pause.
   */
  static async pauseForApproval(
    auth: Authenticator,
    owner: SandboxLifecycleOwner,
    opts: { beforeSleep?: SandboxPreSleepCheck } = {}
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const sandbox = await owner.fetchSandbox();
      if (!sandbox || sandbox.status !== "running") {
        return new Ok(undefined);
      }

      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      // The health check runs BEFORE the pending_approval DB flip on purpose:
      // a failure then leaves DB=running + SDK=running (nothing happened),
      // instead of a pending_approval row for a sandbox that never paused.
      const checkResult = await this.runPreSleepCheck(
        opts.beforeSleep,
        sandbox
      );
      if (checkResult.isErr()) {
        // TODO(@jd 20260730: remove the panic true)
        logger.error(
          {
            sandbox: sandbox.toLogJSON(),
            err: checkResult.error,
            panic: true,
          },
          "Sandbox pre-sleep health check failed — not pausing for approval."
        );
        return checkResult;
      }

      // Flip the DB to `pending_approval` BEFORE the provider sleep.
      // If we slept first and the DB update then failed, we'd be stuck with
      // a frozen SDK sandbox and a DB row saying "running" — ensureActive's
      // `running` branch would skip wake-up and subsequent execs would hang
      // against the frozen sandbox indefinitely. With DB first, a sleep
      // failure leaves DB=pending_approval + SDK=running, which is the
      // recoverable shape: ensureActive's pending_approval branch will wake
      // the (still-running) sandbox on the next call, idempotently.
      await sandbox.updateStatus("pending_approval");

      const sleepResult = await provider.sleep(sandbox.providerId, tracingOpts);
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
    owner: SandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async () => {
      const sandbox = await owner.fetchSandbox();
      if (!sandbox || sandbox.status !== "pending_approval") {
        return new Ok(undefined);
      }

      await sandbox.updateStatus("sleeping");
      logger.info(
        { sandbox: sandbox.toLogJSON() },
        "Pending-approval sandbox transitioned to sleeping."
      );
      return new Ok(undefined);
    });
  }

  /**
   * Destroy a sleeping sandbox for the given owner. Acquires the lifecycle lock,
   * re-fetches the sandbox inside it, and only destroys if still sleeping. If
   * the provider reports the sandbox as gone, marks it deleted anyway.
   */
  static async dangerouslyDestroyIfSleeping(
    auth: Authenticator,
    owner: SandboxLifecycleOwner
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const sandbox = await owner.fetchSandbox();
      if (!sandbox || sandbox.status !== "sleeping") {
        return new Ok(undefined);
      }

      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      const result = await provider.destroy(sandbox.providerId, tracingOpts);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Sandbox not found at provider during destroy — marking deleted."
          );
          await SandboxResource.finalizeDestroyed(sandbox, {
            recordLifecycle: false,
          });
          return new Ok(undefined);
        }
        return result;
      }

      await SandboxResource.finalizeDestroyed(sandbox, {
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
   * `statuses` narrows the sweep: the reaper prioritizes awake sandboxes
   * (running / pending_approval) and sweeps sleeping ones separately, most
   * recently active first (`lastActivityAtDesc`). Sleepers are already
   * flushed from pause time; destroying recently active ones first takes
   * the provider destroy off the user's lazy recreate path.
   *
   * WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyGetKillRequestedSandboxes(opts: {
    limit: number;
    after?: SandboxTimestampCursor;
    statuses?: SandboxStatus[];
    order?: KillRequestedSandboxesOrder;
  }): Promise<SandboxResource[]> {
    const order = opts.order ?? "killRequestedAtAsc";
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        killRequestedAt: { [Op.ne]: null },
        status: opts.statuses
          ? { [Op.in]: opts.statuses }
          : { [Op.ne]: "deleted" },
        ...(opts.after && {
          [Op.and]:
            order === "lastActivityAtDesc"
              ? where(
                  fn("ROW", col("lastActivityAt"), col("id")),
                  Op.lt,
                  fn("ROW", opts.after.timestamp, opts.after.sandboxModelId)
                )
              : where(
                  fn("ROW", col("killRequestedAt"), col("id")),
                  Op.gt,
                  fn("ROW", opts.after.timestamp, opts.after.sandboxModelId)
                ),
        }),
      },
      order:
        order === "lastActivityAtDesc"
          ? [
              ["lastActivityAt", "DESC"],
              ["id", "DESC"],
            ]
          : [
              ["killRequestedAt", "ASC"],
              ["id", "ASC"],
            ],
      limit: opts.limit,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  /**
   * Destroy a sandbox that has a kill request set, regardless of its current
   * status. Acquires the lifecycle lock, re-fetches the sandbox, and only
   * destroys if it is non-deleted and still has `killRequestedAt`. Treats
   * `SandboxNotFoundError` as success.
   *
   * An `opts.beforeSleep` Err skips the destroy for this sweep: the row keeps
   * its `killRequestedAt`, so the reaper retries next cycle. Once the kill
   * request is older than `KILL_REQUESTED_FLUSH_GRACE_MS` the destroy proceeds
   * despite the failing flush, matching what the destroy-and-recreate path
   * already does — an unflushable sandbox must not pin a VM forever.
   */
  static async dangerouslyDestroyIfKillRequested(
    auth: Authenticator,
    owner: SandboxLifecycleOwner,
    opts: { beforeSleep?: SandboxPreSleepCheck } = {}
  ): Promise<Result<void, Error>> {
    return this.withLifecycleLock(owner.lockKey, async (provider) => {
      const sandbox = await owner.fetchSandbox();
      if (
        !sandbox ||
        sandbox.status === "deleted" ||
        !sandbox.killRequestedAt
      ) {
        return new Ok(undefined);
      }

      const tracingOpts = { workspaceId: auth.getNonNullableWorkspace().sId };

      // Pre-destroy flush: kill-requested destroys (image rollouts) would
      // otherwise lose state that never reached its replica.
      const checkResult = await this.runPreSleepCheck(
        opts.beforeSleep,
        sandbox
      );
      if (checkResult.isErr()) {
        const killRequestedForMs =
          Date.now() - sandbox.killRequestedAt.getTime();
        if (killRequestedForMs < KILL_REQUESTED_FLUSH_GRACE_MS) {
          // TODO(@jd 20260730: remove the panic true)
          logger.error(
            {
              sandbox: sandbox.toLogJSON(),
              err: checkResult.error,
              killRequestedForMs,
              panic: true,
            },
            "Kill-requested destroy: pre-destroy health check failed — skipping destroy this sweep."
          );
          return checkResult;
        }

        logger.error(
          {
            sandbox: sandbox.toLogJSON(),
            err: checkResult.error,
            killRequestedForMs,
            panic: true,
          },
          "Kill-requested destroy: pre-destroy health check still failing past the grace period — destroying anyway, unreplicated pod state is lost."
        );
      }

      const result = await provider.destroy(sandbox.providerId, tracingOpts);
      if (result.isErr()) {
        if (result.error instanceof SandboxNotFoundError) {
          logger.info(
            { sandbox: sandbox.toLogJSON() },
            "Kill-requested sandbox not found at provider — marking deleted."
          );
          await SandboxResource.finalizeDestroyed(sandbox, {
            recordLifecycle: false,
          });
          return new Ok(undefined);
        }
        return result;
      }

      await SandboxResource.finalizeDestroyed(sandbox, {
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
   * Read a file from the sandbox filesystem.
   */
  async readFile(
    auth: Authenticator,
    path: string
  ): Promise<Result<Buffer, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    const workspaceId = auth.getNonNullableWorkspace().sId;

    try {
      const data = await provider.readFile(this.providerId, path, {
        workspaceId,
      });

      return new Ok(data);
    } catch (err) {
      if (err instanceof SandboxNotFoundError) {
        logger.error(
          { sandbox: this.toLogJSON() },
          "Sandbox not found at provider during readFile, marking as deleted"
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

  // The provider id is the handle the `e2b sandbox connect` CLI takes, so Poke
  // surfaces it to let operators attach to a live sandbox.
  toPokeJSON(): PokeSandboxType {
    return {
      providerId: this.providerId,
      status: this.status,
    };
  }

  toLogJSON() {
    return {
      id: this.sId,
      workspaceId: this.workspaceId,
      providerId: this.providerId,
      status: this.status,
      lastActivityAt: this.lastActivityAt.toISOString(),
      lastRuntimeRefreshAt: this.lastRuntimeRefreshAt?.toISOString() ?? null,
      baseImage: this.baseImage,
      version: this.version,
      killRequestedAt: this.killRequestedAt?.toISOString() ?? null,
    };
  }
}
