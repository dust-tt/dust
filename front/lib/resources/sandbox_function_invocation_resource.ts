import config from "@app/lib/api/config";
import {
  getPodSandboxFunctionsMountPoint,
  podDatabaseExecEnvVars,
} from "@app/lib/api/files/mount_path";
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
import { recordSandboxFunctionRouting } from "@app/lib/api/sandbox/instrumentation";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import {
  claimInvocationForExec,
  discardPollerJob,
  isPollerChannelOpen,
  POLLER_MAX_JOB_TIMEOUT_MS,
  publishPollerJob,
} from "@app/lib/api/sandbox_functions/poller_channel";
import { parseStdoutResultEnvelope } from "@app/lib/api/sandbox_functions/result_delivery";
import {
  authorizeSandboxFunctionInvocation,
  getAuthenticatedWorkspaceUser,
} from "@app/lib/api/sandbox_functions/workspace_user";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
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
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
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
// How long a dispatched job has to settle before the exec fallback decides nobody took it. Named
// for the handover rather than for pickup: it is an outcome deadline, and a pod that has the
// invocation keeps it past this point. Only paid when a pod that looked reachable does not answer.
const WARM_CHANNEL_HANDOVER_TIMEOUT_MS = 1000;
// The ceiling handed to the poller. Clamped rather than asserted, since raising the inline ceiling
// is an anticipated change and a job asking for more than the channel allows is refused at
// publish, which would turn every warm invocation into a failure.
const WARM_CHANNEL_JOB_TIMEOUT_MS = Math.min(
  SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS,
  POLLER_MAX_JOB_TIMEOUT_MS
);
// How much longer than the job ceiling front waits before calling a pod abandoned. Covers the
// claim round trip and the result callback, which sit outside the pod's own deadline: without it
// a function that legitimately runs to its ceiling gets failed as abandoned, making the warm path
// less tolerant than the exec fallback it replaces.
const WARM_CHANNEL_RESULT_GRACE_MS = 2000;
// Past this an input goes down the exec API's stdin rather than through Redis. A Frame poll sends
// orders of magnitude less than this.
export const WARM_CHANNEL_MAX_INPUT_BYTES = 256 * 1024;

// Which transport ran an invocation, and why. One shape for every routing decision so the warm
// share is a ratio over a single log line rather than a guess across several.
type SandboxFunctionInvocationRoute = "channel" | "exec";
type SandboxFunctionRoutingReason =
  | "channel_disabled"
  | "stdout_delivery_disabled"
  | "oversized_input"
  | "no_presence"
  | "pickup_timeout"
  | "settled"
  | "pod_abandoned";

type PodPollerRouting =
  | { ranOnPod: false }
  | { ranOnPod: true; outcome: SandboxFunctionInvocationOutcome | null };
const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Caps on runner output surfaced on failure: a small head for the error forwarded to the agent,
// a larger one for the log fields.
const SANDBOX_FUNCTION_ERROR_DETAIL_MAX_CHARS = 2_048;
const SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS = 16_384;
const GCS_CONCURRENCY = 4;
const SANDBOX_FUNCTION_INVOCATION_DATA_VERSION = 2;
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

function buildSandboxFunctionRunCommand(
  slug: string,
  { stdoutResultDelivery }: { stdoutResultDelivery: boolean }
): string {
  // dsbx resolves `function run <slug>` as `${DUST_FUNCTIONS_DIR}/<slug>.ts`, which is the
  // read-only mount of the pod's published bundles.
  if (stdoutResultDelivery) {
    return `${DSBX_BIN_PATH} function run --result-delivery stdout -- ${shellEscape(slug)}`;
  }
  return `${DSBX_BIN_PATH} function run ${shellEscape(slug)}`;
}

// Everything the runner needs, resolved once and usable by either transport.
type PreparedSandboxFunctionRun = {
  sandbox: SandboxResource;
  command: string;
  execToken: string;
  stdoutResultDelivery: boolean;
  inputEnvelope: string;
  envVars: Record<string, string>;
};

/**
 * Whether an invocation runs inline, in the request that creates it, instead of through the
 * invocation workflow.
 *
 * Only a fast function qualifies. A durable one may call a tool that waits on the user for
 * approval or authentication, and holding the request there would deadlock: the approval card
 * only renders once the client holds the invocation.
 */
async function shouldExecuteInline(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource
): Promise<boolean> {
  if (sandboxFunction.executionMode !== "fast") {
    return false;
  }

  return hasFeatureFlag(auth, "sandbox_function_fast_execution");
}

function getSandboxFunctionUserIdentity(
  auth: Authenticator,
  user: UserResource | null,
  invocation: SandboxFunctionInvocationResource
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
    return `w/${auth.getNonNullableWorkspace().sId}/sandbox_functions/${this.sandboxFunction.sId}/invocations/${this.sId}`;
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

  // Give the claim back if terminal blob persistence fails, so a later fail()/
  // markCreatedAsErrored() path can still record the outcome.
  private async releaseTerminalClaim(
    from: Exclude<SandboxFunctionInvocationStatus, "created">
  ): Promise<void> {
    const released = await this.casStatus({ from, to: "created" });
    if (!released) {
      logger.error(
        {
          workspaceModelId: this.workspaceId,
          sandboxFunctionId: this.sandboxFunction.sId,
          invocationId: this.sId,
          fromStatus: from,
        },
        "Failed to release Pod function terminal claim after blob write failure"
      );
    }
  }

  async fail(error: Error | SandboxFunctionCallError): Promise<boolean> {
    const callError: SandboxFunctionCallError =
      error instanceof Error
        ? { code: "invocation_failed", message: error.message }
        : error;

    // Only the caller that flips `created` owns the outcome. Guards the
    // double-delivery window (worker stdout + late HTTP callback).
    const claimed = await this.casStatus({
      from: "created",
      to: "errored",
    });
    if (!claimed) {
      logger.warn(
        {
          workspaceModelId: this.workspaceId,
          sandboxFunctionId: this.sandboxFunction.sId,
          invocationId: this.sId,
          attemptedStatus: "errored",
          attemptedError: callError,
        },
        "Skipping terminal transition for an already-terminal Pod function invocation"
      );
      return false;
    }

    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      // Persist the whole error: the code and status are what `inspect_invocations` needs to say
      // why an invocation failed, and dropping them here would leave the message as the only
      // record of a failure the stream classified precisely.
      error: callError,
    };
    const writeResult = await this.writeDataToGcs();
    if (writeResult.isErr()) {
      await this.releaseTerminalClaim("errored");
      throw writeResult.error;
    }
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
          workspaceModelId: this.workspaceId,
          sandboxFunctionId: this.sandboxFunction.sId,
          invocationId: this.sId,
          attemptedStatus: "succeeded",
          attemptedResult: truncate(
            JSON.stringify(result),
            SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS
          ),
        },
        "Skipping terminal transition for an already-terminal Pod function invocation"
      );
      return false;
    }

    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      result,
    };
    const writeResult = await this.writeDataToGcs();
    if (writeResult.isErr()) {
      await this.releaseTerminalClaim("succeeded");
      throw writeResult.error;
    }
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
    return true;
  }
  /**
   * Run the invocation on the pod sandbox and record its outcome.
   *
   * `inline` marks an invocation running inside the request that created it, which constrains it
   * twice. The sandbox is used only if it is already running, never created, woken, or recreated,
   * all of which take seconds to minutes, which the lifecycle enforces under its own lock and
   * reports as `SandboxNotRunningError`. Nothing has executed when that happens, so the caller is
   * free to restart the invocation durably. And execution is bounded by a much shorter timeout, so
   * a function that never returns cannot hold the request open for the workflow's ceiling.
   */
  /**
   * Everything needed to run this invocation on its pod, resolved once.
   *
   * Shared by the two transports that run the same runner the same way: the sandbox exec API, and
   * the pod's poller. Building it in one place is what keeps them from drifting, since a warm
   * invocation that ran with a different environment or a different envelope than the exec
   * fallback would be a bug nobody sees until the fallback fires.
   */
  private async prepareRun(
    auth: Authenticator,
    { requireRunning }: { requireRunning: boolean }
  ): Promise<Result<PreparedSandboxFunctionRun, Error>> {
    const { sandboxFunction } = this;
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return new Err(
        new SandboxFunctionInvocationError(
          "This Pod Function belongs to another workspace."
        )
      );
    }
    const persistedFunction = await SandboxFunctionModel.findOne({
      where: {
        id: this.sandboxFunctionId,
        workspaceId: this.workspaceId,
      },
    });
    if (!persistedFunction) {
      return new Err(new Error("The Pod Function no longer exists."));
    }
    const authorization = await authorizeSandboxFunctionInvocation(auth, {
      userIdentity: persistedFunction.userIdentity,
      origin: this.origin ?? "delegated",
    });
    if (!authorization.authorized) {
      return new Err(
        new SandboxFunctionInvocationError(authorization.errorMessage)
      );
    }

    const ensureResult = await ensurePodSandboxReady(
      auth,
      sandboxFunction.space,
      { requireRunning }
    );
    if (ensureResult.isErr()) {
      return ensureResult;
    }

    await ensureResult.value.sandbox.updateLastActivityAt();

    const sandbox = ensureResult.value.sandbox;
    const stdoutResultDelivery = await hasFeatureFlag(
      auth,
      "sandbox_function_stdout_result"
    );

    const execId = generateExecId();
    // The mode, not the transport, decides this: a fast function is denied tools however it
    // ends up running, so it behaves the same whether it ran inline or through the workflow.
    // Read from the persisted row rather than the in-memory copy, which may predate a
    // re-publish, since this one gates tool access.
    const noTools = persistedFunction.executionMode === "fast";
    const token = await generateSandboxFunctionInvocationToken(auth, {
      sandbox,
      sandboxFunction,
      invocationId: this.sId,
      execId,
      noTools,
    });

    const command = buildSandboxFunctionRunCommand(sandboxFunction.slug, {
      stdoutResultDelivery,
    });
    const inputEnvelope = {
      method: "POST",
      url: `https://dust.local/sandbox-functions/${sandboxFunction.sId}/invocations/${this.sId}`,
      headers: {
        "content-type": "application/json",
        "x-dust-sandbox-function-id": sandboxFunction.sId,
        "x-dust-sandbox-function-invocation-id": this.sId,
      },
      ...(this.input === undefined ? {} : { body: JSON.stringify(this.input) }),
      encoding: "utf8",
    };
    const userIdentity = getSandboxFunctionUserIdentity(
      auth,
      authorization.user,
      this
    );

    return new Ok({
      sandbox,
      command,
      execToken: token,
      stdoutResultDelivery,
      inputEnvelope: JSON.stringify(inputEnvelope),
      envVars: {
        DUST_API_URL: `${dustAPIBaseUrlForSandbox()}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
        DUST_FUNCTIONS_DIR: getPodSandboxFunctionsMountPoint(
          sandboxFunction.space.sId
        ),
        ...podDatabaseExecEnvVars(),
        DUST_SANDBOX_TOKEN: token,
        // Set this for every invocation so userless calls cannot inherit a sandbox-level value.
        [POD_USER_IDENTITY_ENV]: userIdentity
          ? JSON.stringify(userIdentity)
          : "",
      },
    });
  }

  /**
   * Try to run this invocation on the pod's poller instead of through the sandbox exec API.
   *
   * `ranOnPod: false` means the caller should run it itself, which is safe because either no job
   * was dispatched or the exec claim was taken first. Everything here degrades to that: routing is
   * an optimization, and a Redis blip must make an invocation slower, never failed.
   */
  private async tryRunOnPodPoller(
    auth: Authenticator,
    { prepared }: { prepared: PreparedSandboxFunctionRun }
  ): Promise<PodPollerRouting> {
    const { sandboxFunction } = this;
    const dispatchedAtMs = Date.now();
    // Whether a job is live in Redis, and so whether a pod could still pick this up.
    let dispatched = false;
    const logRouting = (
      route: SandboxFunctionInvocationRoute,
      reason: SandboxFunctionRoutingReason
    ) => {
      const durationMs = Date.now() - dispatchedAtMs;
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          sandboxFunctionId: sandboxFunction.sId,
          slug: sandboxFunction.slug,
          invocationId: this.sId,
          route,
          reason,
          durationMs,
        },
        "Routed a fast Pod function invocation"
      );
      recordSandboxFunctionRouting({ route, reason, durationMs });
    };

    try {
      if (!(await hasFeatureFlag(auth, "sandbox_function_warm_channel"))) {
        logRouting("exec", "channel_disabled");
        return { ranOnPod: false };
      }
      // Both transports have to agree on how a result comes back, and the pod's poller only knows
      // how to read the runner's stdout. Rather than run one transport on stdout and the other on
      // the in-sandbox callback, the channel waits for the delivery it matches.
      if (!prepared.stdoutResultDelivery) {
        logRouting("exec", "stdout_delivery_disabled");
        return { ranOnPod: false };
      }
      // Checked before touching Redis since it costs nothing. The job travels through Redis, which
      // is not where a large payload belongs, and an input this size is far outside what a Frame
      // poll sends.
      if (
        Buffer.byteLength(prepared.inputEnvelope, "utf8") >
        WARM_CHANNEL_MAX_INPUT_BYTES
      ) {
        logRouting("exec", "oversized_input");
        return { ranOnPod: false };
      }
      if (!(await isPollerChannelOpen({ sandboxId: prepared.sandbox.sId }))) {
        logRouting("exec", "no_presence");
        return { ranOnPod: false };
      }

      await publishPollerJob(
        {
          invocationId: this.sId,
          functionId: sandboxFunction.sId,
          slug: sandboxFunction.slug,
          execToken: prepared.execToken,
          inputEnvelope: prepared.inputEnvelope,
          envVars: prepared.envVars,
          timeoutMs: WARM_CHANNEL_JOB_TIMEOUT_MS,
        },
        { sandboxId: prepared.sandbox.sId }
      );
      // From here a pod may pick this up at any moment, so failing over to the exec path is no
      // longer free: it needs the claim first.
      dispatched = true;

      // Waiting for the outcome rather than for the pickup keeps the warm path at its natural
      // latency: a job the pod answers in 150ms returns in 150ms, and only a pod that stays silent
      // pays this deadline.
      const outcome = await awaitSandboxFunctionInvocationOutcome({
        invocationId: this.sId,
        timeoutMs: WARM_CHANNEL_HANDOVER_TIMEOUT_MS,
      });
      if (outcome) {
        await this.reloadStatus();
        logRouting("channel", "settled");
        return { ranOnPod: true, outcome };
      }

      // No outcome yet: either the pod took it and is still working, or nothing answered. Taking
      // the claim settles which, and losing the race is the pod telling us it has this one.
      const claimedForExec = await claimInvocationForExec({
        invocationId: this.sId,
      });
      if (claimedForExec) {
        // The pod never picked it up. Drop the job so a poller reconnecting later cannot find work
        // the exec path is about to do, and so the invocation's credential stops sitting in Redis.
        await discardPollerJob({ invocationId: this.sId });
        logRouting("exec", "pickup_timeout");
        return { ranOnPod: false };
      }

      // The pod owns it. Nothing else does, so front has to be the one holding it to a deadline:
      // a pod that claims and then dies would otherwise leave the invocation created forever, and
      // every caller waiting on it would burn its own ceiling.
      const settled = await awaitSandboxFunctionInvocationOutcome({
        invocationId: this.sId,
        timeoutMs: WARM_CHANNEL_JOB_TIMEOUT_MS + WARM_CHANNEL_RESULT_GRACE_MS,
      });
      await this.reloadStatus();
      if (settled) {
        logRouting("channel", "settled");
        return { ranOnPod: true, outcome: settled };
      }

      logRouting("channel", "pod_abandoned");
      await this.fail(
        new SandboxFunctionInvocationError(
          "The Pod stopped responding while running this function."
        )
      );
      return { ranOnPod: true, outcome: null };
    } catch (error) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          sandboxFunctionId: sandboxFunction.sId,
          invocationId: this.sId,
          dispatched,
          error: normalizeError(error).message,
        },
        "Failed to route a fast Pod function invocation to the pod"
      );
      // Nothing was dispatched, so routing was just an optimization that did not pay off and the
      // exec path can still run this.
      if (!dispatched) {
        return { ranOnPod: false };
      }
      // A job is live. Handing this to the exec path without the claim would let a pod that picks
      // the job up run the same function a second time, against the same pod state.
      return this.abandonDispatchedJob(auth);
    }
  }

  /**
   * Decide what to do with an invocation whose routing failed after its job was dispatched.
   *
   * Takes the claim so the exec path can run it, and if the claim cannot be taken the pod has it
   * and the exec path must not. Either way the invocation ends up owned by exactly one runner.
   */
  private async abandonDispatchedJob(
    auth: Authenticator
  ): Promise<PodPollerRouting> {
    try {
      const claimedForExec = await claimInvocationForExec({
        invocationId: this.sId,
      });
      if (claimedForExec) {
        await discardPollerJob({ invocationId: this.sId });
        return { ranOnPod: false };
      }
    } catch (error) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          invocationId: this.sId,
          error: normalizeError(error).message,
        },
        "Failed to claim a dispatched Pod function invocation for the exec path"
      );
    }

    // The pod may be running it and nothing here can tell. Failing the invocation is the only
    // outcome that cannot run it twice, and a caller that gets an error is better than one that
    // waits out its ceiling for a result nobody is coming to deliver.
    await this.fail(
      new SandboxFunctionInvocationError(
        "This Pod function invocation could not be routed to the Pod."
      )
    );
    return { ranOnPod: true, outcome: null };
  }

  // The pod settles an invocation from its own request, in another process, so the copy this
  // request holds still says `created`. Re-read it so both transports hand back the same thing.
  private async reloadStatus(): Promise<void> {
    const row = await this.model.findOne({
      where: { id: this.id, workspaceId: this.workspaceId },
    });
    if (row) {
      Object.assign(this, row.get());
    }
  }

  async execute(
    auth: Authenticator,
    {
      inline = false,
      prepared,
    }: { inline?: boolean; prepared?: PreparedSandboxFunctionRun } = {}
  ): Promise<Result<undefined, Error>> {
    if (this.status !== "created") {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          sandboxFunctionId: this.sandboxFunction.sId,
          invocationId: this.sId,
          invocationStatus: this.status,
        },
        "Skipping execution of a terminal Pod function invocation"
      );
      return new Ok(undefined);
    }

    try {
      const { sandboxFunction } = this;
      // Reused when the caller already prepared the run to try the pod's poller first: preparing
      // twice would mint a second token and re-authorize for no reason.
      const prepareResult =
        prepared !== undefined
          ? new Ok(prepared)
          : await this.prepareRun(auth, { requireRunning: inline });
      if (prepareResult.isErr()) {
        return prepareResult;
      }
      const { sandbox, command, envVars, inputEnvelope, stdoutResultDelivery } =
        prepareResult.value;

      const execResult = await sandbox.exec(auth, command, {
        workingDirectory: SANDBOX_FUNCTION_WORKING_DIRECTORY,
        envVars,
        stdin: inputEnvelope,
        timeoutMs: inline
          ? SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS
          : SANDBOX_FUNCTION_EXEC_TIMEOUT_MS,
        user: "agent-proxied",
      });
      if (execResult.isErr()) {
        if (inline) {
          // An inline exec that fails is usually one that ran past its ceiling, but nothing in the
          // provider result says so: the timeout is handed to the sandbox provider and comes back
          // as an ordinary failure. Log the whole class rather than guess, so we can see how often
          // a fast function is simply too slow before deciding whether that should move it to
          // durable the way a refused tool call does.
          logger.info(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              sandboxFunctionId: sandboxFunction.sId,
              slug: sandboxFunction.slug,
              invocationId: this.sId,
              timeoutMs: SANDBOX_FUNCTION_INLINE_EXEC_TIMEOUT_MS,
              error: execResult.error.message,
            },
            "Inline Pod function execution failed"
          );
        }
        return execResult;
      }

      if (stdoutResultDelivery) {
        const { exitCode, stdout, stderr } = execResult.value;
        logger.info(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            sandboxFunctionId: sandboxFunction.sId,
            invocationId: this.sId,
            exitCode,
            stdoutBytes: Buffer.byteLength(stdout, "utf8"),
            deliveryMode: "stdout",
          },
          "Pod function stdout result delivery"
        );
        // Persist from the envelope even on non-zero exit: dsbx may still have
        // written a well-formed invocation_failed envelope the worker should keep.
        const normalized = parseStdoutResultEnvelope(stdout);
        if (!normalized.ok || exitCode !== 0) {
          // Mirror the callback path's failure logging: without the raw
          // stdout/stderr there is no way to diagnose a rejected envelope.
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              spaceId: sandboxFunction.space.sId,
              sandboxFunctionId: sandboxFunction.sId,
              slug: sandboxFunction.slug,
              invocationId: this.sId,
              exitCode,
              stdout: truncate(stdout, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
              stderr: truncate(stderr, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
              deliveryMode: "stdout",
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
      }

      if (execResult.value.exitCode !== 0) {
        const { exitCode, stdout, stderr } = execResult.value;
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: sandboxFunction.space.sId,
            sandboxFunctionId: sandboxFunction.sId,
            slug: sandboxFunction.slug,
            invocationId: this.sId,
            exitCode,
            stdout: truncate(stdout, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
            stderr: truncate(stderr, SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS),
          },
          "Sandbox function invocation failed"
        );
        // Surface the runner's stderr (stdout when empty) so the agent sees the actual cause,
        // not just the exit code.
        const detail = truncate(
          stderr || stdout,
          SANDBOX_FUNCTION_ERROR_DETAIL_MAX_CHARS
        ).trim();
        return new Err(
          new Error(
            `Pod function invocation failed with exit code ${exitCode}${
              detail ? `:\n${detail}` : "."
            }`
          )
        );
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
        { gcsPath: this.gcsPath, error: storedResult.error.message },
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
    transaction?: Transaction
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

    const writeResult = await resource.writeDataToGcs();
    if (writeResult.isErr()) {
      throw writeResult.error;
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
    const invocation = await this.makeNew(auth, {
      sandboxFunction,
      input: body.input,
      context: body.context,
      origin,
    });
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_created",
        created: invocation.createdAt.getTime(),
        invocation: invocation.toJSON(),
      },
      { invocationId: invocation.sId }
    );

    if (await shouldExecuteInline(auth, sandboxFunction)) {
      // Everything from here to the exec used to run inside `execute`'s own try, which turned a
      // throw into a failed invocation rather than a 500 with a row stuck at `created`. Preparing
      // the run moved out of it, so the guard has to move with it.
      const executionResult = await (async (): Promise<
        Result<undefined, Error>
      > => {
        try {
          const prepareResult = await invocation.prepareRun(auth, {
            requireRunning: true,
          });
          if (prepareResult.isErr()) {
            return prepareResult;
          }
          const routing = await invocation.tryRunOnPodPoller(auth, {
            prepared: prepareResult.value,
          });
          if (routing.ranOnPod) {
            return new Ok(undefined);
          }
          return invocation.execute(auth, {
            inline: true,
            prepared: prepareResult.value,
          });
        } catch (error) {
          return new Err(normalizeError(error));
        }
      })();
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
          workspaceId: auth.getNonNullableWorkspace().sId,
          sandboxFunctionId: sandboxFunction.sId,
          invocationId: invocation.sId,
          reason: "sandbox_not_running",
        },
        "Escalating a fast Pod function invocation to the invocation workflow"
      );
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
          workspaceModelId: this.workspaceId,
          sandboxFunctionId: this.sandboxFunction.sId,
          invocationId: this.sId,
          attemptedStatus: "errored",
          attemptedError: error,
        },
        "Skipping terminal transition for an already-terminal Pod function invocation"
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
    // administrator. Execution and callback paths use the explicit system access after validating
    // their server-owned invocation token or workflow input.
    let viewerModelId: ModelId | undefined;
    switch (access) {
      case "viewer": {
        const viewer = await getAuthenticatedWorkspaceUser(auth);
        if (!viewer) {
          return [];
        }
        viewerModelId = sandboxFunction.space.canAdministrate(auth)
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
    const where = {
      sandboxFunctionId: sandboxFunction.id,
      workspaceId: sandboxFunction.workspaceId,
    };
    const invocations = await this.model.findAll({
      attributes: ["gcsPath"],
      where,
      transaction,
    });
    const gcsPaths = invocations.map(({ gcsPath }) => gcsPath);

    // MCP actions FK invocations with RESTRICT: delete them (rows + output GCS objects) first.
    await SandboxFunctionMCPActionResource.deleteAllForSandboxFunction(
      sandboxFunction,
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
      ...(this.result !== undefined ? { result: this.result } : {}),
      ...(this.error !== undefined ? { error: this.error } : {}),
    };
  }
}
