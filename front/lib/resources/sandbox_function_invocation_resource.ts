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
import logger from "@app/logger/logger";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionInvocationType,
} from "@app/types/api/sandbox_functions";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { truncate } from "@app/types/shared/utils/string_utils";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

const SANDBOX_FUNCTION_WORKING_DIRECTORY = "/home/agent";
const SANDBOX_FUNCTION_EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Caps on runner output surfaced on failure: a small head for the error forwarded to the agent,
// a larger one for the log fields.
const SANDBOX_FUNCTION_ERROR_DETAIL_MAX_CHARS = 2_048;
const SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS = 16_384;
const GCS_CONCURRENCY = 4;

type SandboxFunctionInvocationData = {
  input: unknown;
  result?: unknown;
  error?: string;
};

type StoredSandboxFunctionInvocationData = {
  input?: unknown;
  result?: unknown;
  error?: string;
};

function isStoredSandboxFunctionInvocationData(
  data: unknown
): data is StoredSandboxFunctionInvocationData {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    (!("error" in data) || typeof data.error === "string")
  );
}

function parseSandboxFunctionInvocationData(
  content: string
): SandboxFunctionInvocationData {
  const data: unknown = JSON.parse(content);
  if (!isStoredSandboxFunctionInvocationData(data)) {
    throw new Error("Invalid sandbox function invocation data.");
  }

  return {
    input: data.input,
    ...(Object.hasOwn(data, "result") ? { result: data.result } : {}),
    ...(typeof data.error === "string" ? { error: data.error } : {}),
  };
}

function gcsPathForInvocation(
  auth: Authenticator,
  invocation: SandboxFunctionInvocationResource
): string {
  return `w/${auth.getNonNullableWorkspace().sId}/sandbox_functions/${invocation.sandboxFunction.sId}/invocations/${invocation.sId}`;
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
      data,
    }: {
      sandboxFunction: SandboxFunctionResource;
      data: SandboxFunctionInvocationData;
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

  get input(): unknown {
    return this.data.input;
  }

  get result(): unknown {
    return this.data.result;
  }

  get error(): string | undefined {
    return this.data.error;
  }

  toJSON(): SandboxFunctionInvocationType {
    return {
      sId: this.sId,
      functionId: this.sandboxFunction.sId,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
    };
  }

  async fail(error: Error): Promise<void> {
    await this.writeData({ input: this.input, error: error.message });
    await this.update({ status: "errored" });
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_error",
        created: Date.now(),
        invocationId: this.sId,
        functionId: this.sandboxFunction.sId,
        message: error.message,
      },
      { invocationId: this.sId }
    );
  }

  async succeed(result: unknown): Promise<void> {
    await this.writeData({ input: this.input, result });
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

  async execute(
    auth: Authenticator,
    body: PostSandboxFunctionInvocationRequestBody
  ): Promise<Result<undefined, Error>> {
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
          ...(body.context?.frameFileId
            ? { "x-dust-frame-file-id": body.context.frameFileId }
            : {}),
        },
        ...(body.input === undefined
          ? {}
          : { body: JSON.stringify(body.input) }),
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
            `Sandbox function invocation failed with exit code ${exitCode}${
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

  private static async loadDataFromGcs(
    gcsPath: string | null
  ): Promise<SandboxFunctionInvocationData> {
    if (!gcsPath) {
      return { input: undefined };
    }

    const downloadResult = await withRetry(() =>
      getPrivateUploadBucket().file(gcsPath).download()
    );
    if (downloadResult.isErr()) {
      throw downloadResult.error;
    }

    const [buffer] = downloadResult.value;
    return parseSandboxFunctionInvocationData(buffer.toString("utf-8"));
  }

  private static async writeDataToGcs(
    gcsPath: string,
    data: SandboxFunctionInvocationData
  ): Promise<void> {
    const writeResult = await withRetry(() =>
      getPrivateUploadBucket()
        .file(gcsPath)
        .save(Buffer.from(JSON.stringify(data), "utf-8"), {
          contentType: "application/json",
        })
    );
    if (writeResult.isErr()) {
      throw writeResult.error;
    }
  }

  private async writeData(data: SandboxFunctionInvocationData): Promise<void> {
    if (!this.gcsPath) {
      throw new Error("Sandbox function invocation has no GCS path.");
    }

    await SandboxFunctionInvocationResource.writeDataToGcs(this.gcsPath, data);
    this.data = data;
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
    }: {
      sandboxFunction: SandboxFunctionResource;
      input: unknown;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionInvocationResource> {
    const invocation = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionId: sandboxFunction.id,
        status: "created",
        gcsPath: null,
      },
      { transaction }
    );

    const data = { input };
    const resource = new this(this.model, invocation.get(), {
      sandboxFunction,
      data,
    });
    const gcsPath = gcsPathForInvocation(auth, resource);
    await this.writeDataToGcs(gcsPath, data);
    await resource.update({ gcsPath }, transaction);

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
    });
    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_created",
        created: invocation.createdAt.getTime(),
        invocation: invocation.toJSON(),
      },
      { invocationId: invocation.sId }
    );

    const executionResult = await invocation.execute(auth, body);
    if (executionResult.isErr()) {
      await invocation.fail(executionResult.error);
      return new Err(executionResult.error);
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
        const data = await this.loadDataFromGcs(blob.gcsPath);
        return new this(this.model, blob, { sandboxFunction, data });
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
      where: {
        ...where,
        gcsPath: { [Op.ne]: null },
      },
      transaction,
    });
    const gcsPaths = invocations.flatMap(({ gcsPath }) =>
      gcsPath ? [gcsPath] : []
    );

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
      if (this.gcsPath) {
        await SandboxFunctionInvocationResource.deleteDataFromGcs([
          this.gcsPath,
        ]);
      }

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
