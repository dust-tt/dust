import config from "@app/lib/api/config";
import {
  getPodSandboxFunctionsMountPoint,
  podDatabaseExecEnvVars,
} from "@app/lib/api/files/mount_path";
import {
  generateExecId,
  generateSandboxFunctionInvocationToken,
} from "@app/lib/api/sandbox/access_tokens";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor, withRetry } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionCallError,
  SandboxFunctionInvocationContext,
  SandboxFunctionInvocationStatus,
  SandboxFunctionInvocationType,
} from "@app/types/api/sandbox_functions";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { truncate } from "@app/types/shared/utils/string_utils";
import type { Attributes, Transaction } from "sequelize";
import { z } from "zod";

const SANDBOX_FUNCTION_WORKING_DIRECTORY = "/home/agent";
const SANDBOX_FUNCTION_EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Caps on runner output surfaced on failure: a small head for the error forwarded to the agent,
// a larger one for the log fields.
const SANDBOX_FUNCTION_ERROR_DETAIL_MAX_CHARS = 2_048;
const SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS = 16_384;
const GCS_CONCURRENCY = 4;
const SANDBOX_FUNCTION_INVOCATION_DATA_VERSION = 1;

// `code` is not narrowed to `SandboxFunctionCallErrorCode`: it is forwarded from whatever
// classified the failure (runner, API error type, front), and a blob written by a newer deploy
// must stay readable rather than fail to parse.
const PersistedSandboxFunctionCallErrorSchema = z.union([
  // Blobs written before the code and status were persisted only carry the message. Every such
  // blob went through `fail(Error)`, which classified as `invocation_failed`.
  z.string().transform((message) => ({ code: "invocation_failed", message })),
  z.object({
    code: z.string(),
    message: z.string(),
    status: z.number().optional(),
  }),
]);

type PersistedSandboxFunctionCallError = z.infer<
  typeof PersistedSandboxFunctionCallErrorSchema
>;

const SandboxFunctionInvocationDataSchema = z.object({
  version: z.literal(SANDBOX_FUNCTION_INVOCATION_DATA_VERSION),
  input: z.unknown().optional(),
  context: z
    .object({
      timezone: z.string().optional(),
    })
    .optional(),
  result: z.unknown().optional(),
  error: PersistedSandboxFunctionCallErrorSchema.optional(),
});

type SandboxFunctionInvocationData = z.infer<
  typeof SandboxFunctionInvocationDataSchema
>;

export interface SandboxFunctionInvocationForLLM {
  createdAt: string;
  error?: PersistedSandboxFunctionCallError;
  input: unknown;
  invocationId: string;
  result?: unknown;
  status: SandboxFunctionInvocationStatus;
  updatedAt: string;
}

function parseSandboxFunctionInvocationData(
  content: string
): SandboxFunctionInvocationData {
  const result = SandboxFunctionInvocationDataSchema.safeParse(
    JSON.parse(content)
  );
  if (!result.success) {
    throw new Error(
      `Invalid sandbox function invocation data: ${result.error.message}`
    );
  }

  return result.data;
}

function dustAPIBaseUrlForSandbox(): string {
  return isDevelopment() && config.getSandboxDevFrontHostName()
    ? `https://${config.getSandboxDevFrontHostName()}`
    : config.getApiBaseUrl();
}

function buildSandboxFunctionRunCommand(slug: string): string {
  // dsbx resolves `function run <slug>` as `${DUST_FUNCTIONS_DIR}/<slug>.ts`, which is the
  // read-only mount of the pod's published bundles.
  return `${DSBX_BIN_PATH} function run ${shellEscape(slug)}`;
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

  get error(): PersistedSandboxFunctionCallError | undefined {
    return this.data.error;
  }

  async fail(error: Error | SandboxFunctionCallError): Promise<void> {
    const callError: SandboxFunctionCallError =
      error instanceof Error
        ? { code: "invocation_failed", message: error.message }
        : error;
    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      // Persist the whole error: the code and status are what `inspect_invocations` needs to say
      // why an invocation failed, and dropping them here would leave the message as the only
      // record of a failure the stream classified precisely.
      error: callError,
    };
    await this.writeDataToGcs();
    await this.update({ status: "errored" });
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
  }

  async succeed(result: unknown): Promise<void> {
    this.data = {
      version: SANDBOX_FUNCTION_INVOCATION_DATA_VERSION,
      input: this.input,
      context: this.context,
      result,
    };
    await this.writeDataToGcs();
    await this.update({ status: "succeeded" });
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
  }

  async execute(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      const { sandboxFunction } = this;
      const ensureResult = await ensurePodSandboxReady(
        auth,
        sandboxFunction.space
      );
      if (ensureResult.isErr()) {
        return ensureResult;
      }

      await ensureResult.value.sandbox.updateLastActivityAt();

      const execId = generateExecId();
      const token = await generateSandboxFunctionInvocationToken(auth, {
        sandbox: ensureResult.value.sandbox,
        sandboxFunction,
        invocationId: this.sId,
        execId,
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
      };

      const execResult = await ensureResult.value.sandbox.exec(auth, command, {
        workingDirectory: SANDBOX_FUNCTION_WORKING_DIRECTORY,
        envVars: {
          DUST_API_URL: `${dustAPIBaseUrlForSandbox()}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
          DUST_FUNCTIONS_DIR: getPodSandboxFunctionsMountPoint(
            sandboxFunction.space.sId
          ),
          ...podDatabaseExecEnvVars(),
          DUST_SANDBOX_TOKEN: token,
        },
        stdin: JSON.stringify(inputEnvelope),
        timeoutMs: SANDBOX_FUNCTION_EXEC_TIMEOUT_MS,
        user: "agent-proxied",
      });
      if (execResult.isErr()) {
        return execResult;
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
    this.data = parseSandboxFunctionInvocationData(buffer.toString("utf-8"));
  }

  private async writeDataToGcs(): Promise<void> {
    const writeResult = await withRetry(() =>
      getPrivateUploadBucket()
        .file(this.gcsPath)
        .save(Buffer.from(JSON.stringify(this.data), "utf-8"), {
          contentType: "application/json",
        })
    );
    if (writeResult.isErr()) {
      throw writeResult.error;
    }
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
    }: {
      sandboxFunction: SandboxFunctionResource;
      input: unknown;
      context?: SandboxFunctionInvocationContext;
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

    await resource.writeDataToGcs();
    return resource;
  }

  static async createAndStartExecution(
    auth: Authenticator,
    {
      sandboxFunction,
      body,
    }: {
      sandboxFunction: SandboxFunctionResource;
      body: PostSandboxFunctionInvocationRequestBody;
    }
  ): Promise<Result<SandboxFunctionInvocationResource, Error>> {
    const invocation = await this.makeNew(auth, {
      sandboxFunction,
      input: body.input,
      context: body.context,
    });
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_created",
        created: invocation.createdAt.getTime(),
        invocation: invocation.toJSON(),
      },
      { invocationId: invocation.sId }
    );

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

  private static async baseFetch(
    auth: Authenticator,
    {
      sandboxFunction,
    }: {
      sandboxFunction: SandboxFunctionResource;
    },
    options?: ResourceFindOptions<SandboxFunctionInvocationModel>
  ): Promise<SandboxFunctionInvocationResource[]> {
    const { where, ...rest } = options ?? {};
    const invocations = await this.model.findAll({
      where: {
        ...where,
        sandboxFunctionId: sandboxFunction.id,
        workspaceId: auth.getNonNullableWorkspace().id,
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
    }: {
      sandboxFunction: SandboxFunctionResource;
      invocationId: string;
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
      { sandboxFunction },
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
