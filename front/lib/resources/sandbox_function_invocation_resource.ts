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

const SANDBOX_FUNCTION_WORKING_DIRECTORY = "/home/agent";
const SANDBOX_FUNCTION_EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Caps on runner output surfaced on failure: a small head for the error forwarded to the agent,
// a larger one for the log fields.
const SANDBOX_FUNCTION_ERROR_DETAIL_MAX_CHARS = 2_048;
const SANDBOX_FUNCTION_ERROR_LOG_MAX_CHARS = 16_384;

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

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionInvocationModel>,
    blob: Attributes<SandboxFunctionInvocationModel>,
    { sandboxFunction }: { sandboxFunction: SandboxFunctionResource }
  ) {
    super(model, blob);
    this.sandboxFunction = sandboxFunction;
  }

  get sId(): string {
    return SandboxFunctionInvocationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
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

  static async makeNew(
    auth: Authenticator,
    {
      sandboxFunction,
    }: {
      sandboxFunction: SandboxFunctionResource;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionInvocationResource> {
    const invocation = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionId: sandboxFunction.id,
        status: "created",
      },
      { transaction }
    );

    return new this(this.model, invocation.get(), { sandboxFunction });
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
    const invocation = await this.makeNew(auth, { sandboxFunction });
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

    return invocations.map(
      (invocation) =>
        new this(this.model, invocation.get(), { sandboxFunction })
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
    // MCP actions FK invocations with RESTRICT: delete them (rows + output GCS objects) first.
    await SandboxFunctionMCPActionResource.deleteAllForSandboxFunction(
      sandboxFunction,
      { transaction }
    );

    return this.model.destroy({
      where: {
        sandboxFunctionId: sandboxFunction.id,
        workspaceId: sandboxFunction.workspaceId,
      },
      transaction,
    });
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

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
