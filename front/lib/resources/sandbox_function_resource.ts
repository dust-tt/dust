import type { PokePodFunction } from "@app/lib/api/poke/projects";
import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { authorizeSandboxFunctionInvocation } from "@app/lib/api/sandbox_functions/workspace_user";
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
import type { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionAuthenticationPolicy,
} from "@app/types/api/sandbox_functions";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFunctionResource
  extends ReadonlyAttributesType<SandboxFunctionModel> {}

function authenticationPolicyStrength(
  authentication: SandboxFunctionAuthenticationPolicy
): number {
  switch (authentication) {
    case "optional":
      return 0;
    case "workspace_user_required":
      return 1;
    default:
      assertNeverAndIgnore(authentication);
      return Number.MAX_SAFE_INTEGER;
  }
}

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
      authentication = "optional",
      inputSchema,
      outputSchema,
    }: {
      space: SpaceResource;
      file: FileResource;
      slug: string;
      description: string;
      authentication?: SandboxFunctionAuthenticationPolicy;
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
        authentication,
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
      authentication = this.authentication ?? "optional",
      inputSchema,
      outputSchema,
    }: {
      bundleCode: string;
      description: string;
      authentication?: SandboxFunctionAuthenticationPolicy;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    }
  ): Promise<Result<undefined, Error>> {
    try {
      return await withTransaction(async (transaction) => {
        const lockedFunction = await this.model.findOne({
          where: {
            id: this.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!lockedFunction) {
          return new Err(new Error("The Pod Function no longer exists."));
        }

        try {
          const currentAuthentication =
            lockedFunction.authentication ?? "optional";
          if (
            authenticationPolicyStrength(authentication) >
            authenticationPolicyStrength(currentAuthentication)
          ) {
            await this.update({ authentication }, transaction);
          }

          await this.file.uploadContent(auth, bundleCode);
          await this.update(
            {
              description,
              authentication,
              inputSchema,
              outputSchema,
            },
            transaction
          );
        } catch (error) {
          // Resolving with Err commits any restrictive policy written before
          // the bundle upload, keeping a partial re-publish fail-closed.
          return new Err(normalizeError(error));
        }

        return new Ok(undefined);
      });
    } catch (error) {
      return new Err(normalizeError(error));
    }
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

    return SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId: SandboxFunctionInvocationResource.modelIdToSId({
        id: invocation.id,
        workspaceId: invocation.workspaceId,
      }),
    });
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
  ): Promise<Result<SandboxFunctionInvocationResource, Error>> {
    const authorization = await authorizeSandboxFunctionInvocation(auth, {
      authentication: this.authentication,
      workspaceId: this.workspaceId,
    });
    if (!authorization.authorized) {
      return new Err(
        new SandboxFunctionInvocationError(
          "This Pod Function requires a logged-in user from its workspace."
        )
      );
    }

    return SandboxFunctionInvocationResource.createAndStartExecution(auth, {
      sandboxFunction: this,
      body,
    });
  }

  toPokeJSON(author: UserResource | null): PokePodFunction {
    return {
      sId: this.sId,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      author: author ? author.fullName() : null,
    };
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
