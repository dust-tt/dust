import config from "@app/lib/api/config";
import type {
  PokePodFunctionInvocation,
  PokePodFunctionInvocationDetails,
  PokePodFunctionMCPAction,
} from "@app/lib/api/poke/projects";
import {
  generateExecId,
  generateSandboxFunctionInvocationToken,
} from "@app/lib/api/sandbox/access_tokens";
import { isSandboxNotRunningError } from "@app/lib/api/sandbox/errors";
import { recordSandboxFunctionRun } from "@app/lib/api/sandbox/instrumentation";
import type { EnsureSandboxReadyResult } from "@app/lib/api/sandbox/lifecycle";
import {
  ensureFrameSandboxReady,
  ensurePodSandboxReady,
} from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { podDatabasePrefixFromSlug } from "@app/lib/api/sandbox_functions/db_naming";
import type { SandboxFunctionInvocationErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import {
  parseStdoutResultEnvelope,
  resolveSpilledResult,
} from "@app/lib/api/sandbox_functions/result_delivery";
import type { SandboxFunctionAuthorization } from "@app/lib/api/sandbox_functions/workspace_user";
import {
  authorizeSandboxFunctionInvocation,
  getAuthenticatedWorkspaceUser,
} from "@app/lib/api/sandbox_functions/workspace_user";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FrameSandboxScope } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import {
  SandboxFunctionInvocationModel,
  SandboxFunctionModel,
} from "@app/lib/resources/storage/models/sandbox_function";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor, withRetry } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionCallError,
  SandboxFunctionInvocationContext,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationOutcome,
  SandboxFunctionInvocationStatus,
  SandboxFunctionInvocationType,
} from "@app/types/api/sandbox_functions";
import {
  getFramePublicationDescriptorMountPoint,
  getFramePublicationFunctionsMountPoint,
  getPodSandboxFunctionsMountPoint,
  sandboxDatabaseExecEnvVars,
} from "@app/types/mount_path";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { truncate } from "@app/types/shared/utils/string_utils";
import type { Attributes, Transaction } from "sequelize";
import { col, fn, Op } from "sequelize";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const SANDBOX_FUNCTION_WORKING_DIRECTORY = "/home/agent";
const SANDBOX_FUNCTION_EXEC_TIMEOUT_MS = 2 * 60 * 1000;
// A fast function is contractually short, and an inline invocation holds a request for as long as
// it runs. Bound it well below the workflow's ceiling: past this the invocation is failed rather
// than handed to the workflow, since by then the function may already have written to pod state
// and re-running it would repeat those writes.
const SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS = 10 * 1000;
const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Cap on runner output surfaced in the log fields on failure.
const SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS = 16_384;
const GCS_CONCURRENCY = 4;
const SANDBOX_FUNCTION_INVOCATION_DATA_VERSION = 2;
const FUNCTION_WARM_ENABLED_ENV = "DUST_FUNCTION_WARM_ENABLED";
const POD_USER_IDENTITY_ENV = "DUST_POD_USER_IDENTITY";

// "admin" reads every invocation of the function without resolving a workspace user: poke
// operators are dust superusers, not members of the workspace they inspect, so "viewer" would
// find no user and return nothing. Kept distinct from "system", which is reserved for paths that
// already validated a server-owned invocation token.
type SandboxFunctionInvocationReadAccess = "viewer" | "system" | "admin";

// A listing row: the DB columns only, without the invocation's GCS blob. `baseFetch` always
// hydrates the blob, and an unhydrated resource reports `input: undefined` rather than "not
// loaded", so a listing that skipped the download could not hand back resources without breaking
// that invariant. Callers that need a payload fetch the one invocation they care about.
export type SandboxFunctionInvocationRow = {
  sId: string;
  status: SandboxFunctionInvocationStatus;
  origin: SandboxFunctionInvocationOrigin | null;
  userId: ModelId | null;
  createdAt: Date;
  updatedAt: Date;
  mcpActionCount: number;
};

// `code` is not narrowed to `SandboxFunctionCallErrorCode`: it is forwarded from whatever
// classified the failure (runner, API error type, front), and a code introduced by a newer deploy
// must stay readable rather than fail to parse.
const StoredCallErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number().optional(),
});

export type StoredSandboxFunctionCallError = z.infer<
  typeof StoredCallErrorSchema
>;

// A `findAll` carrying an aggregate attribute returns plain rows rather than model instances, so
// the model's declared types do not describe them. Parsed instead of cast so a shape change fails
// loudly. `count` is coerced because aggregates arrive as strings from some drivers.
const InvocationCountByUserRowSchema = z.object({
  userId: z.number().nullable(),
  count: z.coerce.number(),
});

const InvocationDataBaseSchema = z.object({
  input: z.unknown().optional(),
  context: z
    .object({
      timezone: z.string().optional(),
    })
    .optional(),
  result: z.unknown().optional(),
  // The hash of the bundle the invocation was executed against, recorded by the terminal
  // transition when the executing instance stamped it. Absent on blobs written before the field
  // existed, on invocations that never reached execution, and on outcomes delivered through the
  // in-sandbox HTTP callback (a separately fetched instance settles those).
  bundleSha256: z.string().optional(),
});

// Every shape we have ever written, discriminated on `version` so a new one is an added arm rather
// than a wider guess at what a blob contains. Reads accept all of them, writes always produce the
// current version.
const StoredInvocationDataSchema = z.discriminatedUnion("version", [
  // v1 recorded the failure message only.
  InvocationDataBaseSchema.extend({
    version: z.literal(1),
    error: z.string().optional(),
  }),
  // v2 records the whole call error, so `inspect_invocations` can report its code and status.
  InvocationDataBaseSchema.extend({
    version: z.literal(2),
    error: StoredCallErrorSchema.optional(),
  }),
]);

type StoredInvocationData = z.infer<typeof StoredInvocationDataSchema>;

// Derived from the current arm rather than written out, so the two cannot drift. Bumping the
// version constant makes `case 2` below stop typechecking until a migration exists.
type SandboxFunctionInvocationData = Extract<
  StoredInvocationData,
  { version: typeof SANDBOX_FUNCTION_INVOCATION_DATA_VERSION }
>;

function migrateStoredInvocationData(
  stored: StoredInvocationData
): SandboxFunctionInvocationData {
  switch (stored.version) {
    case 1:
      // Spread rather than list fields, so a field added to the shared base carries through
      // instead of being silently dropped from every v1 blob on read.
      return {
        ...stored,
        version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
        // v1 only ever recorded errors that went through `fail(Error)`, which classified them as
        // `invocation_failed`.
        error:
          stored.error !== undefined
            ? { code: "invocation_failed", message: stored.error }
            : undefined,
      };
    case 2:
      return stored;
    default:
      return assertNever(stored);
  }
}

interface SandboxFunctionInvocationForLLM {
  bundleSha256?: string;
  createdAt: string;
  error?: StoredSandboxFunctionCallError;
  input: unknown;
  invocationId: string;
  result?: unknown;
  status: SandboxFunctionInvocationStatus;
  updatedAt: string;
}

function safeParseStoredInvocationData(
  content: string
): Result<StoredInvocationData, Error> {
  const jsonResult = safeParseJSON(content);
  if (jsonResult.isErr()) {
    return jsonResult;
  }

  const parseResult = StoredInvocationDataSchema.safeParse(jsonResult.value);
  if (!parseResult.success) {
    return new Err(new Error(fromError(parseResult.error).toString()));
  }

  return new Ok(parseResult.data);
}

function dustAPIBaseUrlForSandbox(): string {
  return isDevelopment() && config.getSandboxDevFrontHostName()
    ? `https://${config.getSandboxDevFrontHostName()}`
    : config.getApiBaseUrl();
}

function buildSandboxFunctionRunCommand(slug: string): string {
  // dsbx resolves `function run <slug>` as `${DUST_FUNCTIONS_DIR}/<slug>.ts`, which is the
  // read-only mount of the pod's published bundles. Results always come back on the exec's own
  // stdout.
  return `${DSBX_BIN_PATH} function run --result-delivery stdout -- ${shellEscape(slug)}`;
}

function getSandboxFunctionUserIdentity(
  auth: Authenticator,
  user: UserResource | null,
  invocation: SandboxFunctionInvocationResource,
  pod: SpaceResource | null
) {
  const workspace = auth.getNonNullableWorkspace();
  if (
    !user ||
    invocation.workspaceId !== workspace.id ||
    invocation.userId !== user.id
  ) {
    return null;
  }

  return {
    workspaceId: workspace.sId,
    // Same predicate as the `isEditor` the pod UI serializes: pod editor group members plus
    // workspace admins via role.
    isPodEditor: pod ? auth.can("admin", pod) : false,
    // Same predicate as the pod UI's `isMember` and the `pod_member_required` policy: users in
    // any of the pod's groups. Workspace admins outside them are not members.
    isPodMember: pod?.isMember(auth) ?? false,
    user: {
      sId: user.sId,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName(),
      image: user.imageUrl,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFunctionInvocationResource
  extends ReadonlyAttributesType<SandboxFunctionInvocationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFunctionInvocationResource extends BaseResource<SandboxFunctionInvocationModel> {
  static model: ModelStaticWorkspaceAware<SandboxFunctionInvocationModel> =
    SandboxFunctionInvocationModel;

  readonly sandboxFunction: SandboxFunctionResource;
  private data: SandboxFunctionInvocationData;

  /**
   * In-flight blob persistence for an inline execution: the deferred initial write (blob +
   * created event), and after a terminal transition also the write-behind terminal blob write
   * chained onto it. The chaining keeps the object-level ordering (the terminal write can never
   * be overwritten by a late initial one) without holding the caller's response on GCS. Only
   * ever set on the instance that runs the invocation inline; instances rehydrated from the DB
   * never have one, and never need one.
   */
  private pendingInitialPersistence: Promise<void> | undefined;

  async settleInitialPersistence(): Promise<void> {
    // Re-read after each await: a terminal transition can chain a write-behind onto the field
    // while a settle is in flight, and clearing blindly would drop that chain undrained.
    while (this.pendingInitialPersistence) {
      const pending = this.pendingInitialPersistence;
      await pending;
      if (this.pendingInitialPersistence === pending) {
        this.pendingInitialPersistence = undefined;
      }
    }
  }

  /**
   * The outcome recorded by a terminal transition that ran on this instance, kept with its
   * original types (the stored blob deliberately widens error codes to plain strings). Callers
   * use it to skip the event-stream read-back after an inline execution: subscribing to Redis
   * would only re-fetch what this process just produced.
   */
  private lastSettledOutcome: SandboxFunctionInvocationOutcome | undefined;

  /**
   * The hash of the bundle execute() ran (or attempted to run) this invocation against, read
   * from the persisted function row at execution time. Only ever set on the instance that
   * executed; the terminal transitions fold it into the stored blob so `inspect_invocations`
   * can report which publish served each invocation.
   */
  private executedBundleSha256: string | undefined;

  settledOutcome(): SandboxFunctionInvocationOutcome | null {
    return this.lastSettledOutcome ?? null;
  }

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionInvocationModel>,
    blob: Attributes<SandboxFunctionInvocationModel>,
    {
      sandboxFunction,
      data = {
        version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
        input: undefined,
      },
    }: {
      sandboxFunction: SandboxFunctionResource;
      data?: SandboxFunctionInvocationData;
    }
  ) {
    super(model, blob);
    this.sandboxFunction = sandboxFunction;
    this.data = data;
  }

  get sId(): string {
    return SandboxFunctionInvocationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  private buildGcsPath(auth: Authenticator): string {
    const frame = this.sandboxFunction.frame;
    if (frame) {
      return `w/${auth.getNonNullableWorkspace().sId}/frames/${frame.sId}/invocations/${this.sId}`;
    }
    return `w/${auth.getNonNullableWorkspace().sId}/sandbox_functions/${this.sandboxFunction.sId}/invocations/${this.sId}`;
  }

  private observabilityContext(auth?: Authenticator) {
    const frame = this.sandboxFunction.frame;
    const sourceConversationId = frame?.useCaseMetadata?.conversationId;
    const sourceSpaceId = frame?.useCaseMetadata?.spaceId;

    return {
      ...(auth
        ? { workspaceId: auth.getNonNullableWorkspace().sId }
        : { workspaceModelId: this.workspaceId }),
      functionOwnerKind: frame ? "frame" : "pod",
      sandboxFunctionId: this.sandboxFunction.sId,
      functionName: this.sandboxFunction.slug,
      invocationId: this.sId,
      ...(frame
        ? {
            frameId: frame.sId,
            ...(this.sandboxFunction.publicationId
              ? { publicationId: this.sandboxFunction.publicationId }
              : {}),
            frameSourceScope: sourceSpaceId
              ? "pod"
              : sourceConversationId
                ? "conversation"
                : "unknown",
            ...(sourceSpaceId || sourceConversationId
              ? { frameSourceScopeId: sourceSpaceId ?? sourceConversationId }
              : {}),
          }
        : { spaceId: this.sandboxFunction.space.sId }),
    };
  }

  get input(): unknown {
    return this.data.input;
  }

  get context(): SandboxFunctionInvocationContext | undefined {
    return this.data.context;
  }

  get result(): unknown {
    return this.data.result;
  }

  get error(): StoredSandboxFunctionCallError | undefined {
    return this.data.error;
  }

  get bundleSha256(): string | undefined {
    return this.data.bundleSha256;
  }

  // WHERE-guarded compare-and-swap on status. Same pattern as
  // SandboxFunctionMCPActionResource.updateStatusFromExpected: BaseResource.update()
  // only keys on `id`, so the expected-status predicate goes on the model here.
  private async casStatus({
    from,
    to,
  }: {
    from: SandboxFunctionInvocationStatus;
    to: SandboxFunctionInvocationStatus;
  }): Promise<boolean> {
    const [affectedCount, rows] = await this.model.update(
      { status: to },
      {
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
          status: from,
        },
        returning: true,
      }
    );
    if (affectedCount === 0) {
      return false;
    }
    const row = rows[0];
    if (row) {
      Object.assign(this, row.get());
    }
    return true;
  }

  /**
   * Persist the terminal blob (input, context, outcome), set on `this.data` by the caller.
   *
   * Inline path (a deferred initial persistence is pending): the write chains behind it,
   * write-behind. The caller's response and the result event carry the outcome, and every
   * cross-process blob reader is either explicitly settled first (the workflow handoff awaits
   * settleInitialPersistence) or reads well after the write's ~100-500ms window (inspection,
   * listings), so nothing is left holding a request on GCS tail latency. The cost is a
   * narrower durability guarantee: a write that fails, or a process that dies right after
   * responding, leaves a terminal row whose blob is missing the outcome. Logged loudly; the
   * outcome itself was still delivered to the caller and the event stream.
   *
   * Every other path keeps the awaited write, and gives the terminal claim back on failure so
   * a retry can record the outcome.
   */
  private async persistTerminalData(
    claimed: Exclude<SandboxFunctionInvocationStatus, "created">
  ): Promise<void> {
    if (this.pendingInitialPersistence !== undefined) {
      const pending = this.pendingInitialPersistence;
      this.pendingInitialPersistence = (async () => {
        // Invariant: `pending` never rejects — its producers settle internally (makeNew logs
        // its write failure, createAndStartExecution wraps in Promise.allSettled) — and
        // writeDataToGcs returns a Result, so this floating chain cannot produce an unhandled
        // rejection. The claim is deliberately kept on failure, unlike the awaited branch:
        // releasing here would strand a row whose caller already got the outcome, with nothing
        // left to retry it.
        await pending;
        const writeResult = await this.writeDataToGcs();
        if (writeResult.isErr()) {
          logger.error(
            {
              ...this.observabilityContext(),
              claimedStatus: claimed,
              err: writeResult.error,
            },
            "Write-behind terminal sandbox function invocation persistence failed"
          );
        }
      })();
      return;
    }

    await this.settleInitialPersistence();
    const writeResult = await this.writeDataToGcs();
    if (writeResult.isErr()) {
      await this.releaseTerminalClaim(claimed);
      throw writeResult.error;
    }
  }

  // Give the claim back if terminal blob persistence fails, so a later fail()/
  // markCreatedAsErrored() path can still record the outcome.
  private async releaseTerminalClaim(
    from: Exclude<SandboxFunctionInvocationStatus, "created">
  ): Promise<void> {
    const released = await this.casStatus({ from, to: "created" });
    if (!released) {
      logger.error(
        {
          ...this.observabilityContext(),
          fromStatus: from,
        },
        "Failed to release sandbox function terminal claim after blob write failure"
      );
    }
  }

  async fail(error: Error | SandboxFunctionCallError): Promise<boolean> {
    const callError: SandboxFunctionCallError =
      error instanceof Error
        ? { code: "invocation_failed", message: error.message }
        : error;

    // Only the caller that flips `created` owns the outcome. Guards the
    // double-delivery window (an inline run and the invocation workflow both settling).
    const claimed = await this.casStatus({
      from: "created",
      to: "errored",
    });
    if (!claimed) {
      logger.warn(
        {
          ...this.observabilityContext(),
          attemptedStatus: "errored",
          attemptedError: callError,
        },
        "Skipping terminal transition for an already-terminal sandbox function invocation"
      );
      return false;
    }

    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      ...(this.executedBundleSha256 === undefined
        ? {}
        : { bundleSha256: this.executedBundleSha256 }),
      // Persist the whole error: the code and status are what `inspect_invocations` needs to say
      // why an invocation failed, and dropping them here would leave the message as the only
      // record of a failure the stream classified precisely.
      error: callError,
    };
    await this.persistTerminalData("errored");
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_error",
        created: Date.now(),
        invocationId: this.sId,
        functionId: this.sandboxFunction.sId,
        error: callError,
      },
      { invocationId: this.sId }
    );
    this.lastSettledOutcome = { status: "errored", error: callError };
    return true;
  }

  async succeed(result: unknown): Promise<boolean> {
    const claimed = await this.casStatus({
      from: "created",
      to: "succeeded",
    });
    if (!claimed) {
      logger.warn(
        {
          ...this.observabilityContext(),
          attemptedStatus: "succeeded",
          attemptedResult: truncate(
            JSON.stringify(result),
            SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS
          ),
        },
        "Skipping terminal transition for an already-terminal sandbox function invocation"
      );
      return false;
    }

    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      ...(this.executedBundleSha256 === undefined
        ? {}
        : { bundleSha256: this.executedBundleSha256 }),
      result,
    };
    await this.persistTerminalData("succeeded");
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: this.sId,
        functionId: this.sandboxFunction.sId,
        result,
      },
      { invocationId: this.sId }
    );
    this.lastSettledOutcome = { status: "succeeded", result };
    return true;
  }
  /**
   * Run the invocation on its owner's sandbox and record its outcome.
   *
   * `inline` marks an invocation running inside the request that created it, which constrains it
   * twice. The sandbox is used only if it is already running, never created, woken, or recreated,
   * all of which take seconds to minutes, which the lifecycle enforces under its own lock and
   * reports as `SandboxNotRunningError`. Nothing has executed when that happens, so the caller is
   * free to restart the invocation durably. And execution is bounded by a much shorter timeout, so
   * a function that never returns cannot hold the request open for the workflow's ceiling.
   */
  async execute(
    auth: Authenticator,
    { inline = false }: { inline?: boolean } = {}
  ): Promise<Result<undefined, Error>> {
    if (this.status !== "created") {
      logger.info(
        {
          ...this.observabilityContext(auth),
          invocationStatus: this.status,
        },
        "Skipping execution of a terminal sandbox function invocation"
      );
      return new Ok(undefined);
    }

    try {
      const { sandboxFunction } = this;
      const frame = sandboxFunction.frame;
      const publicationId = sandboxFunction.publicationId;
      const functionKind = frame ? "Frame function" : "Pod Function";
      if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
        return new Err(
          new SandboxFunctionInvocationError(
            `This ${functionKind} belongs to another workspace.`
          )
        );
      }
      // The function re-fetch (it guards a re-publish race on `noTools` below) and its dependent
      // authorization are independent of the sandbox readiness check. On the inline path
      // (requireRunning) readiness is a read with no side effect, so the two chains overlap to
      // take the slower one off the critical path. On the durable path readiness may create or
      // wake a sandbox, a paid side effect that stays gated behind the checks.
      const runFunctionCheck = async (): Promise<{
        persistedFunction: SandboxFunctionModel;
        podAuthorization: SandboxFunctionAuthorization | null;
        error: {
          code: SandboxFunctionInvocationErrorCode;
          message: string;
        } | null;
      } | null> => {
        const persistedFunction = await SandboxFunctionModel.findOne({
          where: {
            id: this.sandboxFunctionId,
            workspaceId: this.workspaceId,
          },
        });
        if (!persistedFunction) {
          return null;
        }
        if (frame) {
          // Frame invocations always require a workspace member. This scope-independent check
          // gates the paid wakeup; Pod membership and token scope are evaluated below from the
          // lifecycle-locked scope, after a concurrent move can no longer change it.
          const user = await getAuthenticatedWorkspaceUser(auth);
          return {
            persistedFunction,
            podAuthorization: null,
            error: user
              ? null
              : {
                  code: "user_authentication_required",
                  message:
                    "This Frame function requires a logged-in user from its workspace.",
                },
          };
        }
        const authorization = await authorizeSandboxFunctionInvocation(auth, {
          userIdentity: persistedFunction.userIdentity,
          origin: this.origin ?? "delegated",
          owner: { kind: "pod", space: sandboxFunction.space },
        });
        return {
          persistedFunction,
          podAuthorization: authorization,
          error: authorization.authorized
            ? null
            : {
                code: authorization.errorCode,
                message: authorization.errorMessage,
              },
        };
      };
      const runEnsure = async (): Promise<
        Result<EnsureSandboxReadyResult & { scope?: FrameSandboxScope }, Error>
      > =>
        frame
          ? ensureFrameSandboxReady(auth, frame, { requireRunning: inline })
          : ensurePodSandboxReady(auth, sandboxFunction.space, {
              requireRunning: inline,
            });

      let functionCheck;
      let ensureResult;
      if (inline) {
        [functionCheck, ensureResult] = await Promise.all([
          runFunctionCheck(),
          runEnsure(),
        ]);
      } else {
        functionCheck = await runFunctionCheck();
        if (functionCheck === null || functionCheck.error !== null) {
          ensureResult = null;
        } else {
          ensureResult = await runEnsure();
        }
      }
      if (!functionCheck) {
        return new Err(new Error(`The ${functionKind} no longer exists.`));
      }
      const { persistedFunction } = functionCheck;
      if (functionCheck.error !== null) {
        return new Err(
          new SandboxFunctionInvocationError(
            functionCheck.error.message,
            functionCheck.error.code
          )
        );
      }
      if (!ensureResult) {
        // Unreachable: ensureResult is only null when a check above already returned.
        return new Err(
          new Error(
            `The ${frame ? "Frame" : "Pod"} sandbox could not be prepared.`
          )
        );
      }
      if (ensureResult.isErr()) {
        return ensureResult;
      }

      let authorization: SandboxFunctionAuthorization | null;
      if (frame) {
        const { scope } = ensureResult.value;
        if (!scope) {
          return new Err(new Error("The Frame runtime scope is missing."));
        }
        authorization = await authorizeSandboxFunctionInvocation(auth, {
          userIdentity: persistedFunction.userIdentity,
          origin: this.origin ?? "delegated",
          owner: {
            kind: "frame",
            frame,
            scope,
          },
        });
      } else {
        authorization = functionCheck.podAuthorization;
      }
      if (!authorization) {
        return new Err(
          new Error(`The ${functionKind} authorization is missing.`)
        );
      }
      if (!authorization.authorized) {
        return new Err(
          new SandboxFunctionInvocationError(
            authorization.errorMessage,
            authorization.errorCode
          )
        );
      }

      // No updateLastActivityAt here: ensurePodSandboxReady's ensureActive just wrote it.
      const sandbox = ensureResult.value.sandbox;

      const execId = generateExecId();
      // The mode, not the transport, decides this: a fast function is denied tools however it
      // ends up running, so it behaves the same whether it ran inline or through the workflow.
      // Read from the persisted row rather than the in-memory copy, which may predate a
      // re-publish, since this one gates tool access.
      const noTools = persistedFunction.executionMode === "fast";
      // Remember which bundle this execution serves, so the terminal transition records the
      // version behind the outcome.
      this.executedBundleSha256 = persistedFunction.bundleSha256 ?? undefined;
      const token = await generateSandboxFunctionInvocationToken(auth, {
        sandbox,
        sandboxFunction,
        owner: frame
          ? {
              kind: "frame",
              frameId: frame.sId,
              spaceId: authorization.runtimeSpaceId,
            }
          : { kind: "pod", spaceId: authorization.runtimeSpaceId },
        invocationId: this.sId,
        execId,
        noTools,
      });

      const command = buildSandboxFunctionRunCommand(sandboxFunction.slug);
      const inputEnvelope = {
        method: "POST",
        url: `https://dust.local/sandbox-functions/${sandboxFunction.sId}/invocations/${this.sId}`,
        headers: {
          "content-type": "application/json",
          "x-dust-sandbox-function-id": sandboxFunction.sId,
          "x-dust-sandbox-function-invocation-id": this.sId,
        },
        ...(this.input === undefined
          ? {}
          : { body: JSON.stringify(this.input) }),
        encoding: "utf8",
        // From the persisted row, like the mode above: the warm server refuses to serve a
        // bundle that does not hash to this, so a republished function is never run from a
        // stale warm import. Null only for functions last published before hashes existed —
        // those keep the server's stat/lifetime backstops.
        ...(persistedFunction.bundleSha256 === null
          ? {}
          : { bundleSha256: persistedFunction.bundleSha256 }),
      };
      const userIdentity = getSandboxFunctionUserIdentity(
        auth,
        authorization.user,
        this,
        authorization.pod
      );

      let functionsDirectory: string;
      let databaseEnvVars: ReturnType<typeof sandboxDatabaseExecEnvVars>;
      if (frame) {
        if (!publicationId) {
          return new Err(
            new Error("The Frame function has no publication identity.")
          );
        }
        functionsDirectory = getFramePublicationFunctionsMountPoint({
          frameId: frame.sId,
          publicationId,
        });
        databaseEnvVars = sandboxDatabaseExecEnvVars({
          framePublicationDescriptorPath:
            getFramePublicationDescriptorMountPoint({
              frameId: frame.sId,
              publicationId,
            }),
        });
      } else {
        functionsDirectory = getPodSandboxFunctionsMountPoint(
          sandboxFunction.space.sId
        );
        databaseEnvVars = sandboxDatabaseExecEnvVars({
          databasePrefix: podDatabasePrefixFromSlug(sandboxFunction.slug),
        });
      }

      const execStartedAtMs = Date.now();
      const execResult = await tracer.trace(
        "sandbox.function.execute",
        { resource: frame ? "frame" : "pod" },
        async (span) => {
          span?.setTag("workspace.id", auth.getNonNullableWorkspace().sId);
          span?.setTag("function.owner_kind", frame ? "frame" : "pod");
          span?.setTag("sandbox_function.id", sandboxFunction.sId);
          span?.setTag("function.name", sandboxFunction.slug);
          span?.setTag("invocation.id", this.sId);
          if (frame) {
            span?.setTag("frame.id", frame.sId);
            span?.setTag("frame.publication_id", publicationId ?? "unknown");
            span?.setTag(
              "frame.source_scope",
              frame.useCaseMetadata?.spaceId
                ? "pod"
                : frame.useCaseMetadata?.conversationId
                  ? "conversation"
                  : "unknown"
            );
            span?.setTag(
              "frame.source_scope_id",
              frame.useCaseMetadata?.spaceId ??
                frame.useCaseMetadata?.conversationId ??
                "unknown"
            );
          } else {
            span?.setTag("pod.space_id", sandboxFunction.space.sId);
          }

          return sandbox.exec(auth, command, {
            workingDirectory: SANDBOX_FUNCTION_WORKING_DIRECTORY,
            envVars: {
              DUST_API_URL: `${dustAPIBaseUrlForSandbox()}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
              DUST_FUNCTIONS_DIR: functionsDirectory,
              // The app prefix comes from the slug, so `db("chat")` in the bundle resolves to this
              // app's own database without the source naming the app.
              ...databaseEnvVars,
              DUST_SANDBOX_TOKEN: token,
              // Durable functions may still spawn tool clients that inherit the function process's
              // native environment. Keep them cold until all tool calls read the invocation context;
              // fast functions cannot call tools and are safe to serve from a resident worker.
              [FUNCTION_WARM_ENABLED_ENV]: noTools ? "1" : "0",
              // Set this for every invocation so userless calls cannot inherit a sandbox-level value.
              [POD_USER_IDENTITY_ENV]: userIdentity
                ? JSON.stringify(userIdentity)
                : "",
            },
            stdin: JSON.stringify(inputEnvelope),
            // The envelope is this function's own input, and the same exec already hands it a token
            // through the environment, so there is nothing here that the environment newly exposes.
            // Worth two fewer round trips to the sandbox on the latency-sensitive path.
            allowStdinInEnvironment: true,
            timeoutMs: inline
              ? SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS
              : SANDBOX_FUNCTION_EXEC_TIMEOUT_MS,
            user: "agent-proxied",
          });
        }
      );
      if (execResult.isErr()) {
        // Exec-level failures (timeouts included) must land in the same metric as served runs,
        // or the duration distribution silently drops the slowest attempts.
        recordSandboxFunctionRun({
          ownerKind: frame ? "frame" : "pod",
          runnerKind: "unknown",
          status: "error",
          durationMs: Date.now() - execStartedAtMs,
        });
        if (inline) {
          // An inline exec that fails is usually one that ran past its ceiling, but nothing in the
          // provider result says so: the timeout is handed to the sandbox provider and comes back
          // as an ordinary failure. Log the whole class rather than guess, so we can see how often
          // a fast function is simply too slow before deciding whether that should move it to
          // durable the way a refused tool call does.
          logger.info(
            {
              ...this.observabilityContext(auth),
              timeoutMs: SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS,
              error: execResult.error.message,
            },
            "Inline sandbox function execution failed"
          );
        }
        return execResult;
      }

      const { exitCode, stdout, stderr } = execResult.value;
      // Persist from the envelope even on non-zero exit: dsbx may still have
      // written a well-formed invocation_failed envelope the worker should keep.
      const parsed = parseStdoutResultEnvelope(stdout);
      const { timings } = parsed;
      logger.info(
        {
          ...this.observabilityContext(auth),
          exitCode,
          stdoutBytes: Buffer.byteLength(stdout, "utf8"),
          ...(parsed.spill === null
            ? {}
            : { spilledResultBytes: parsed.spill.resultBytes }),
        },
        "Sandbox function stdout result delivery"
      );
      // An oversized result was spilled to a sandbox-local file: read it back
      // through the provider and normalize it exactly like an inline outcome.
      const normalized =
        parsed.spill === null
          ? parsed.outcome
          : await resolveSpilledResult(parsed.spill, (path) =>
              sandbox.readFile(auth, path)
            );
      recordSandboxFunctionRun({
        ownerKind: frame ? "frame" : "pod",
        runnerKind: timings?.runnerKind ?? "unknown",
        status: normalized.ok ? "success" : "error",
        durationMs: Date.now() - execStartedAtMs,
      });
      if (!normalized.ok || exitCode !== 0) {
        // Without the raw stdout/stderr there is no way to diagnose a rejected envelope.
        logger.error(
          {
            ...this.observabilityContext(auth),
            exitCode,
            stdout: truncate(stdout, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
            stderr: truncate(stderr, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
          },
          "Sandbox function invocation failed"
        );
      }
      if (normalized.ok) {
        await this.succeed(normalized.output);
      } else {
        await this.fail(normalized.error);
      }

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("sandbox_function_invocation", { id, workspaceId });
  }

  private async loadDataFromGcs(): Promise<void> {
    const downloadResult = await withRetry(() =>
      getPrivateUploadBucket().file(this.gcsPath).download()
    );
    if (downloadResult.isErr()) {
      throw downloadResult.error;
    }

    const [buffer] = downloadResult.value;
    const storedResult = safeParseStoredInvocationData(
      buffer.toString("utf-8")
    );
    if (storedResult.isErr()) {
      // Listings load every invocation's blob, so failing here would take down a whole listing
      // over one unreadable record: a truncated write, or a blob a newer deploy wrote mid-rollout.
      // Degrade to an empty record and keep the rest of the listing readable.
      logger.error(
        {
          ...this.observabilityContext(),
          gcsPath: this.gcsPath,
          error: storedResult.error.message,
        },
        "Invalid sandbox function invocation data"
      );
      this.data = { version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION };

      return;
    }

    this.data = migrateStoredInvocationData(storedResult.value);
  }

  private async writeDataToGcs(): Promise<Result<undefined, Error>> {
    try {
      await getPrivateUploadBucket().uploadBufferToBucket({
        buffer: Buffer.from(JSON.stringify(this.data), "utf-8"),
        contentType: "application/json",
        filePath: this.gcsPath,
      });
    } catch (err) {
      return new Err(normalizeError(err));
    }
    return new Ok(undefined);
  }

  private static async deleteDataFromGcs(gcsPaths: string[]): Promise<void> {
    try {
      const bucket = getPrivateUploadBucket();
      await concurrentExecutor(
        gcsPaths,
        (gcsPath) => bucket.delete(gcsPath, { ignoreNotFound: true }),
        { concurrency: GCS_CONCURRENCY }
      );
    } catch (error) {
      logger.error(
        { err: normalizeError(error), pathCount: gcsPaths.length },
        "Failed to delete sandbox function invocation data from GCS"
      );
    }
  }

  static async makeNew(
    auth: Authenticator,
    {
      sandboxFunction,
      input,
      context,
      origin = "delegated",
    }: {
      sandboxFunction: SandboxFunctionResource;
      input: unknown;
      context?: SandboxFunctionInvocationContext;
      origin?: SandboxFunctionInvocationOrigin;
    },
    transaction?: Transaction,
    // Inline executions defer the initial blob write (see createAndStartExecution): the terminal
    // transition rewrites the full blob anyway, so the upload only needs to finish before that
    // write, not before execution starts.
    { deferInitialWrite = false }: { deferInitialWrite?: boolean } = {}
  ): Promise<SandboxFunctionInvocationResource> {
    const resource = await withTransaction(async (t) => {
      const invocation = await this.model.create(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          sandboxFunctionId: sandboxFunction.id,
          // Null when the invocation has no human origin (e.g. public API key runs, slack/email
          // bot messages). Scheduled triggers carry their editor's user, so they are not null.
          userId: auth.user()?.id ?? null,
          origin,
          status: "created",
          // The final path contains the database-generated invocation sId. This placeholder is
          // replaced in the same transaction before the row becomes visible.
          gcsPath: "",
        },
        { transaction: t }
      );

      const data: SandboxFunctionInvocationData = {
        version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
        input,
        context,
      };
      const resource = new this(this.model, invocation.get(), {
        sandboxFunction,
        data,
      });
      const gcsPath = resource.buildGcsPath(auth);
      await resource.update({ gcsPath }, t);

      return resource;
    }, transaction);

    if (deferInitialWrite) {
      resource.pendingInitialPersistence = resource
        .writeDataToGcs()
        .then((result) => {
          if (result.isErr()) {
            // Surfaced here rather than thrown: the terminal transition rewrites the full blob,
            // so a failed initial upload only matters if the invocation never settles.
            logger.error(
              {
                ...resource.observabilityContext(auth),
                err: result.error,
              },
              "Deferred sandbox function invocation blob write failed"
            );
          }
        });
    } else {
      const writeResult = await resource.writeDataToGcs();
      if (writeResult.isErr()) {
        throw writeResult.error;
      }
    }
    return resource;
  }

  static async createAndStartExecution(
    auth: Authenticator,
    {
      sandboxFunction,
      body,
      origin = "delegated",
    }: {
      sandboxFunction: SandboxFunctionResource;
      body: PostSandboxFunctionInvocationRequestBody;
      origin?: SandboxFunctionInvocationOrigin;
    }
  ): Promise<Result<SandboxFunctionInvocationResource, Error>> {
    // An inline invocation runs in the request that creates it. Only a fast function qualifies:
    // a durable one may call a tool that waits on the user for approval or authentication, and
    // holding the request there would deadlock, since the approval card only renders once the
    // client holds the invocation.
    const inline = sandboxFunction.executionMode === "fast";
    // Deferring is only safe because no other process reads the blob during execution, which
    // holds because every run is started with `--result-delivery stdout`: the result comes back
    // on the exec's own stdout, so nothing fetches the invocation, and its blob, mid-execution.
    const invocation = await this.makeNew(
      auth,
      {
        sandboxFunction,
        input: body.input,
        context: body.context,
        origin,
      },
      undefined,
      { deferInitialWrite: inline }
    );
    const publishCreated = () =>
      publishSandboxFunctionInvocationEvent(
        {
          type: "sandbox_function_invocation_created",
          created: invocation.createdAt.getTime(),
          invocation: invocation.toJSON(),
        },
        { invocationId: invocation.sId }
      );

    if (inline) {
      // The created event rides with the deferred blob write: nothing before the terminal
      // transition consumes either. The result event may outrun the created event (the terminal
      // transition chains its blob write behind this promise instead of awaiting it), which
      // stream consumers already tolerate: they settle on the first terminal event and treat
      // the created event as optional.
      const pendingBlobWrite = invocation.pendingInitialPersistence;
      invocation.pendingInitialPersistence = Promise.allSettled([
        pendingBlobWrite,
        Promise.resolve(publishCreated()).catch((error) => {
          // Stream consumers tolerate a missing created event (they stop at the first terminal
          // event), but losing one must be visible.
          logger.error(
            {
              ...invocation.observabilityContext(auth),
              err: normalizeError(error),
            },
            "Deferred sandbox function invocation created-event publish failed"
          );
        }),
      ]).then(() => undefined);
    } else {
      await publishCreated();
    }

    if (inline) {
      const executionResult = await invocation.execute(auth, { inline: true });
      if (executionResult.isOk()) {
        return new Ok(invocation);
      }
      if (!isSandboxNotRunningError(executionResult.error)) {
        // The invocation ran and failed. Record the outcome here, as the invocation workflow's
        // activity does, so listeners settle instead of waiting for a workflow that never ran.
        await invocation.fail(executionResult.error);
        return new Ok(invocation);
      }
      // The sandbox has to be resumed first. Nothing has executed, so hand the invocation to the
      // workflow, which owns waits that outlive a request.
      logger.info(
        {
          ...invocation.observabilityContext(auth),
          reason: "sandbox_not_running",
        },
        "Escalating a fast sandbox function invocation to the invocation workflow"
      );
    }

    // The workflow activity re-reads the invocation, blob included, from another process: a
    // deferred initial write must be durable before the workflow can be allowed to start. The
    // rewrite is idempotent (same object, same content) and this is already the slow path.
    await invocation.settleInitialPersistence();
    const persistResult = await invocation.writeDataToGcs();
    if (persistResult.isErr()) {
      throw persistResult.error;
    }

    const launchResult = await launchSandboxFunctionInvocationWorkflow(auth, {
      sandboxFunction,
      invocation,
    });
    if (launchResult.isErr()) {
      await invocation.fail(launchResult.error);
      return new Err(launchResult.error);
    }

    return new Ok(invocation);
  }

  async markCreatedAsErrored(
    error: SandboxFunctionCallError
  ): Promise<boolean> {
    const claimed = await this.casStatus({
      from: "created",
      to: "errored",
    });
    if (!claimed) {
      logger.warn(
        {
          ...this.observabilityContext(),
          attemptedStatus: "errored",
          attemptedError: error,
        },
        "Skipping terminal transition for an already-terminal sandbox function invocation"
      );
      return false;
    }

    // Do not overwrite the invocation blob here. This path only records that
    // execution failed before the runner could return a structured result.
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_error",
        created: Date.now(),
        invocationId: this.sId,
        functionId: this.sandboxFunction.sId,
        error,
      },
      { invocationId: this.sId }
    );

    return true;
  }

  private static async baseFetch(
    auth: Authenticator,
    {
      sandboxFunction,
      access = "viewer",
    }: {
      sandboxFunction: SandboxFunctionResource;
      access?: SandboxFunctionInvocationReadAccess;
    },
    options?: ResourceFindOptions<SandboxFunctionInvocationModel>
  ): Promise<SandboxFunctionInvocationResource[]> {
    const { where, ...rest } = options ?? {};
    // User-facing reads expose the caller's invocations, or every invocation to a Pod
    // administrator. Execution paths use the explicit system access after validating their
    // server-owned invocation token or workflow input.
    let viewerModelId: ModelId | undefined;
    switch (access) {
      case "viewer": {
        const viewer = await getAuthenticatedWorkspaceUser(auth);
        if (!viewer) {
          return [];
        }
        viewerModelId = sandboxFunction.frame
          ? viewer.id
          : auth.can("admin", sandboxFunction.space)
            ? undefined
            : viewer.id;
        break;
      }
      case "system":
      case "admin":
        viewerModelId = undefined;
        break;
      default:
        return assertNever(access);
    }

    const invocations = await this.model.findAll({
      where: {
        ...where,
        sandboxFunctionId: sandboxFunction.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(viewerModelId !== undefined ? { userId: viewerModelId } : {}),
      },
      ...rest,
    });

    return concurrentExecutor(
      invocations,
      async (invocation) => {
        const blob = invocation.get();
        const resource = new this(this.model, blob, { sandboxFunction });
        await resource.loadDataFromGcs();
        return resource;
      },
      { concurrency: GCS_CONCURRENCY }
    );
  }

  static async fetchById(
    auth: Authenticator,
    {
      sandboxFunction,
      invocationId,
      access = "viewer",
    }: {
      sandboxFunction: SandboxFunctionResource;
      invocationId: string;
      access?: SandboxFunctionInvocationReadAccess;
    }
  ): Promise<SandboxFunctionInvocationResource | null> {
    if (!isResourceSId("sandbox_function_invocation", invocationId)) {
      return null;
    }

    const invocationModelId = getResourceIdFromSId(invocationId);
    if (invocationModelId === null) {
      return null;
    }

    const [invocation] = await this.baseFetch(
      auth,
      { sandboxFunction, access },
      {
        where: {
          id: invocationModelId,
        },
      }
    );

    return invocation ?? null;
  }

  static async listRecent(
    auth: Authenticator,
    {
      sandboxFunction,
      limit,
    }: {
      sandboxFunction: SandboxFunctionResource;
      limit: number;
    }
  ): Promise<SandboxFunctionInvocationResource[]> {
    return this.baseFetch(
      auth,
      { sandboxFunction },
      {
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        limit,
      }
    );
  }

  // Newest-first page of listing rows, no GCS read. See `SandboxFunctionInvocationRow`.
  static async listRows(
    auth: Authenticator,
    {
      sandboxFunction,
      limit,
      statuses,
      origins,
    }: {
      sandboxFunction: SandboxFunctionResource;
      limit: number;
      statuses?: SandboxFunctionInvocationStatus[];
      origins?: SandboxFunctionInvocationOrigin[];
    }
  ): Promise<SandboxFunctionInvocationRow[]> {
    const invocations = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionId: sandboxFunction.id,
        ...(statuses && statuses.length > 0 ? { status: statuses } : {}),
        ...(origins && origins.length > 0 ? { origin: origins } : {}),
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
    });

    const mcpActionCounts =
      await SandboxFunctionMCPActionResource.countByInvocationModelIds(
        auth,
        invocations.map((invocation) => invocation.id)
      );

    return invocations.map((invocation) => ({
      sId: this.modelIdToSId({
        id: invocation.id,
        workspaceId: invocation.workspaceId,
      }),
      status: invocation.status,
      origin: invocation.origin,
      userId: invocation.userId,
      createdAt: invocation.createdAt,
      updatedAt: invocation.updatedAt,
      mcpActionCount: mcpActionCounts.get(invocation.id) ?? 0,
    }));
  }

  // Invocation counts per triggering user across a set of functions, since a cutoff. Grouped in
  // SQL rather than counted in JS: the window can span many rows and none of them are needed
  // individually. The `null` key holds invocations with no human actor (API keys, bots).
  static async countByUserSince(
    auth: Authenticator,
    {
      sandboxFunctionIds,
      since,
    }: {
      sandboxFunctionIds: ModelId[];
      since: Date;
    }
  ): Promise<Map<ModelId | null, number>> {
    const counts = new Map<ModelId | null, number>();
    if (sandboxFunctionIds.length === 0) {
      return counts;
    }

    const rows = await this.model.findAll({
      attributes: ["userId", [fn("COUNT", col("id")), "count"]],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionId: sandboxFunctionIds,
        createdAt: { [Op.gte]: since },
      },
      group: ["userId"],
      raw: true,
    });

    for (const row of rows) {
      const { userId, count } = InvocationCountByUserRowSchema.parse(row);
      counts.set(userId, count);
    }

    return counts;
  }

  static async deleteAllForSandboxFunction(
    sandboxFunction: SandboxFunctionResource,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    return this.deleteAllForSandboxFunctionModelIds(
      {
        workspaceModelId: sandboxFunction.workspaceId,
        sandboxFunctionModelIds: [sandboxFunction.id],
      },
      { transaction }
    );
  }

  static async deleteAllForSandboxFunctionModelIds(
    {
      workspaceModelId,
      sandboxFunctionModelIds,
    }: {
      workspaceModelId: ModelId;
      sandboxFunctionModelIds: ModelId[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    if (sandboxFunctionModelIds.length === 0) {
      return 0;
    }

    const where = {
      sandboxFunctionId: sandboxFunctionModelIds,
      workspaceId: workspaceModelId,
    };
    const invocations = await this.model.findAll({
      attributes: ["id", "gcsPath"],
      where,
      transaction,
    });
    const gcsPaths = invocations.map(({ gcsPath }) => gcsPath);

    // MCP actions FK invocations with RESTRICT: delete them (rows + output GCS objects) first.
    await SandboxFunctionMCPActionResource.deleteAllForInvocationModelIds(
      {
        workspaceModelId,
        invocationModelIds: invocations.map(({ id }) => id),
      },
      { transaction }
    );

    const deletedCount = await this.model.destroy({ where, transaction });
    await this.deleteDataFromGcs(gcsPaths);

    return deletedCount;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      // MCP actions FK this invocation with RESTRICT: delete them (rows + output GCS objects)
      // first.
      await SandboxFunctionMCPActionResource.deleteAllForInvocation(
        auth,
        this,
        { transaction }
      );

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      await SandboxFunctionInvocationResource.deleteDataFromGcs([this.gcsPath]);

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  // Poke's listing shape. Static because the listing works off rows rather than resources (see
  // `SandboxFunctionInvocationRow`), and both entry points must produce the same shape.
  static rowToPokeJSON(
    row: SandboxFunctionInvocationRow,
    user: UserResource | null
  ): PokePodFunctionInvocation {
    return {
      sId: row.sId,
      status: row.status,
      origin: row.origin,
      user: user ? user.fullName() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      mcpActionCount: row.mcpActionCount,
    };
  }

  // The listing shape plus the GCS-backed payload this resource carries once hydrated, and the
  // MCP actions the caller resolved for it.
  toPokeJSON(
    user: UserResource | null,
    mcpActions: PokePodFunctionMCPAction[]
  ): PokePodFunctionInvocationDetails {
    return {
      ...SandboxFunctionInvocationResource.rowToPokeJSON(
        {
          sId: this.sId,
          status: this.status,
          origin: this.origin,
          userId: this.userId,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
          mcpActionCount: mcpActions.length,
        },
        user
      ),
      input: this.input,
      result: this.result,
      error: this.error ?? null,
      mcpActions,
    };
  }

  toJSON(): SandboxFunctionInvocationType {
    return {
      sId: this.sId,
      functionId: this.sandboxFunction.sId,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
    };
  }

  toJSONForLLM(): SandboxFunctionInvocationForLLM {
    return {
      createdAt: this.createdAt.toISOString(),
      input: this.input,
      invocationId: this.sId,
      status: this.status,
      updatedAt: this.updatedAt.toISOString(),
      // Which publish served this invocation: comparable against the hash `publish` and `get`
      // echo. Absent when the invocation predates the stamping or never reached execution.
      ...(this.bundleSha256 !== undefined
        ? { bundleSha256: this.bundleSha256 }
        : {}),
      ...(this.result !== undefined ? { result: this.result } : {}),
      ...(this.error !== undefined ? { error: this.error } : {}),
    };
  }
}
