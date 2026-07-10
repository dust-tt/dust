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
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
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
import logger from "@app/logger/logger";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionInvocationType,
} from "@app/types/api/sandbox_functions";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { truncate } from "@app/types/shared/utils/string_utils";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
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
export interface SandboxFunctionResource
  extends ReadonlyAttributesType<SandboxFunctionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFunctionResource extends BaseResource<SandboxFunctionModel> {
  static model: ModelStaticWorkspaceAware<SandboxFunctionModel> =
    SandboxFunctionModel;

  readonly space: SpaceResource;
  file: FileResource;

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionModel>,
    blob: Attributes<SandboxFunctionModel>,
    space: SpaceResource,
    file: FileResource
  ) {
    super(model, blob);
    this.space = space;
    this.file = file;
  }

  get sId(): string {
    return SandboxFunctionResource.modelIdToSId({
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
    return makeSId("sandbox_function", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    {
      space,
      file,
      slug,
      description,
      inputSchema,
      outputSchema,
    }: {
      space: SpaceResource;
      file: FileResource;
      slug: string;
      description: string;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionResource> {
    assert(space.isProject(), "Sandbox functions can only belong to pods.");
    assert(
      isValidSandboxFunctionSlug(slug),
      "The slug must be lowercase alphanumeric with single hyphen separators."
    );
    assert(
      space.workspaceId === auth.getNonNullableWorkspace().id,
      "The space must belong to the authenticated workspace."
    );
    assert(
      file.workspaceId === auth.getNonNullableWorkspace().id,
      "The file must belong to the authenticated workspace."
    );
    assert(
      file.contentType === sandboxFunctionContentType,
      `The file must use the ${sandboxFunctionContentType} content type.`
    );
    assert(
      file.useCase === "project_context",
      "The file must use the project_context use case."
    );
    assert(
      file.useCaseMetadata?.spaceId === space.sId,
      "The file must belong to the same pod as the sandbox function."
    );

    const sandboxFunction = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
        fileId: file.id,
        slug,
        description,
        inputSchema,
        outputSchema,
      },
      { transaction }
    );

    return new this(this.model, sandboxFunction.get(), space, file);
  }

  /**
   * Re-publish: overwrite this function's bundle in place and refresh its contract. uploadContent
   * rewrites the same file (canonical original plus its mount path <prefix>/<slug>.ts) and bumps the
   * version, so the function's storage path stays stable across re-publishes rather than drifting to
   * a disambiguated name. The caller checks write permission.
   */
  async updateContent(
    auth: Authenticator,
    {
      bundleCode,
      description,
      inputSchema,
      outputSchema,
    }: {
      bundleCode: string;
      description: string;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    }
  ): Promise<Result<undefined, Error>> {
    try {
      await this.file.uploadContent(auth, bundleCode);
      await this.update({ description, inputSchema, outputSchema });
    } catch (error) {
      return new Err(normalizeError(error));
    }

    return new Ok(undefined);
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SandboxFunctionModel>
  ): Promise<SandboxFunctionResource[]> {
    const { where, ...rest } = options ?? {};
    const sandboxFunctions = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      Array.from(
        new Set(
          sandboxFunctions.map(
            (sandboxFunction) => sandboxFunction.get().spaceId
          )
        )
      )
    );
    const accessibleSpacesById = new Map(
      spaces
        .filter(
          (space) => space.isProject() && space.canReadOrAdministrate(auth)
        )
        .map((space) => [space.id, space])
    );

    const files = await FileResource.fetchByModelIdsWithAuth(
      auth,
      Array.from(
        new Set(
          sandboxFunctions.map(
            (sandboxFunction) => sandboxFunction.get().fileId
          )
        )
      )
    );
    const filesById = new Map(files.map((file) => [file.id, file]));

    return sandboxFunctions.flatMap((sandboxFunction) => {
      const space = accessibleSpacesById.get(sandboxFunction.get().spaceId);
      const file = filesById.get(sandboxFunction.get().fileId);
      if (!space || !file) {
        return [];
      }

      return [new this(this.model, sandboxFunction.get(), space, file)];
    });
  }

  static async fetchById(
    auth: Authenticator,
    sandboxFunctionId: string
  ): Promise<SandboxFunctionResource | null> {
    if (!isResourceSId("sandbox_function", sandboxFunctionId)) {
      return null;
    }

    const sandboxFunctionModelId = getResourceIdFromSId(sandboxFunctionId);
    if (sandboxFunctionModelId === null) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { id: sandboxFunctionModelId },
    });

    return sandboxFunction ?? null;
  }

  // Lives here rather than on SandboxFunctionMCPActionResource: that resource can only type-import
  // the invocation resource (the invocation resource value-imports it for cascade deletion), so it
  // cannot construct an invocation. Takes the action rather than its FK id so callers don't thread
  // a ModelId around.
  static async fetchInvocationForAction(
    auth: Authenticator,
    action: SandboxFunctionMCPActionResource
  ): Promise<SandboxFunctionInvocationResource | null> {
    const invocation = await SandboxFunctionInvocationModel.findOne({
      where: {
        id: action.sandboxFunctionInvocationId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    if (!invocation) {
      return null;
    }

    const sandboxFunction = await this.fetchById(
      auth,
      this.modelIdToSId({
        id: invocation.sandboxFunctionId,
        workspaceId: invocation.workspaceId,
      })
    );
    if (!sandboxFunction) {
      return null;
    }

    return new SandboxFunctionInvocationResource(
      SandboxFunctionInvocationModel,
      invocation.get(),
      { sandboxFunction }
    );
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<SandboxFunctionResource[]> {
    if (!space.isProject()) {
      return [];
    }

    return this.baseFetch(auth, { where: { spaceId: space.id } });
  }

  static async fetchBySpaceAndSlug(
    auth: Authenticator,
    space: SpaceResource,
    slug: string
  ): Promise<SandboxFunctionResource | null> {
    if (!space.isProject()) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { spaceId: space.id, slug },
    });

    return sandboxFunction ?? null;
  }

  static async fetchByIdOrSlug(
    auth: Authenticator,
    functionIdOrSlug: string
  ): Promise<SandboxFunctionResource | null> {
    const sandboxFunction = await this.fetchById(auth, functionIdOrSlug);
    if (sandboxFunction) {
      return sandboxFunction;
    }

    const [podId, slug, ...rest] = functionIdOrSlug.split("/");
    if (!podId || !slug || rest.length > 0) {
      return null;
    }
    if (!isResourceSId("space", podId) || !isValidSandboxFunctionSlug(slug)) {
      return null;
    }

    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return null;
    }

    return this.fetchBySpaceAndSlug(auth, space, slug);
  }

  static async deleteAllForSpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<Result<number, Error>> {
    assert(space.isProject(), "Sandbox functions can only belong to pods.");

    const sandboxFunctions = await this.listBySpace(auth, space);
    for (const sandboxFunction of sandboxFunctions) {
      // TODO(spolu): potentially optimize as this may be quite slow (each delete calls file delete
      // which deletes a whole bunch of records).
      const result = await sandboxFunction.delete(auth);
      if (result.isErr()) {
        return new Err(result.error);
      }
    }

    return new Ok(sandboxFunctions.length);
  }

  async invoke(
    auth: Authenticator,
    body: PostSandboxFunctionInvocationRequestBody
  ): Promise<Result<SandboxFunctionInvocationType, Error>> {
    let invocation: SandboxFunctionInvocationResource | null = null;

    // Once the invocation exists, listeners may be waiting on its event channel for a terminal
    // event: publish the error so they settle instead of waiting forever, then propagate it.
    const failInvocation = async (
      error: Error
    ): Promise<Result<SandboxFunctionInvocationType, Error>> => {
      if (invocation) {
        try {
          await publishSandboxFunctionInvocationEvent(
            {
              type: "sandbox_function_invocation_error",
              created: Date.now(),
              invocationId: invocation.sId,
              functionId: this.sId,
              message: error.message,
            },
            { invocationId: invocation.sId }
          );
        } catch (publishError) {
          // Best effort: the error is still propagated to the caller through the Err below.
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              sandboxFunctionId: this.sId,
              invocationId: invocation.sId,
              error: normalizeError(publishError),
            },
            "Failed to publish sandbox function invocation error event"
          );
        }
      }
      return new Err(error);
    };

    try {
      if (!this.space.canReadOrAdministrate(auth)) {
        return new Err(new Error("Sandbox function space is not accessible."));
      }

      const ensureResult = await ensurePodSandboxReady(auth, this.space);
      if (ensureResult.isErr()) {
        return ensureResult;
      }

      invocation = await SandboxFunctionInvocationResource.makeNew(auth, {
        sandboxFunction: this,
      });
      await ensureResult.value.sandbox.updateLastActivityAt();

      const execId = generateExecId();
      const token = await generateSandboxFunctionInvocationToken(auth, {
        sandbox: ensureResult.value.sandbox,
        sandboxFunction: this,
        invocationId: invocation.sId,
        execId,
      });

      const command = buildSandboxFunctionRunCommand(this.slug);
      const inputEnvelope = {
        method: "POST",
        url: `https://dust.local/sandbox-functions/${this.sId}/invocations/${invocation.sId}`,
        headers: {
          "content-type": "application/json",
          "x-dust-sandbox-function-id": this.sId,
          "x-dust-sandbox-function-invocation-id": invocation.sId,
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
          DUST_FUNCTIONS_DIR: getPodSandboxFunctionsMountPoint(this.space.sId),
          ...podDatabaseExecEnvVars(),
          DUST_SANDBOX_TOKEN: token,
        },
        stdin: JSON.stringify(inputEnvelope),
        timeoutMs: SANDBOX_FUNCTION_EXEC_TIMEOUT_MS,
        user: "agent-proxied",
      });
      if (execResult.isErr()) {
        return failInvocation(execResult.error);
      }
      if (execResult.value.exitCode !== 0) {
        const { exitCode, stdout, stderr } = execResult.value;
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: this.space.sId,
            sandboxFunctionId: this.sId,
            slug: this.slug,
            invocationId: invocation.sId,
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
        return failInvocation(
          new Error(
            `Sandbox function invocation failed with exit code ${exitCode}${
              detail ? `:\n${detail}` : "."
            }`
          )
        );
      }

      // Keep the invocation token valid for its short TTL. The durable version
      // of this flow will let dsbx post invocation results back to Dust with
      // the same token, then revoke it once results are accepted.
      return new Ok({
        sId: invocation.sId,
        functionId: this.sId,
        status: invocation.status,
        createdAt: invocation.createdAt.toISOString(),
      });
    } catch (error) {
      return failInvocation(normalizeError(error));
    }
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      if (!this.space.canReadOrAdministrate(auth)) {
        return new Err(new Error("Sandbox function space is not accessible."));
      }

      await SandboxFunctionInvocationResource.deleteAllForSandboxFunction(this);

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

      return this.file.delete(auth);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
