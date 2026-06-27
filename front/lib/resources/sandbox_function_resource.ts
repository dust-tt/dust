import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { sandboxFunctionContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFunctionResource
  extends ReadonlyAttributesType<SandboxFunctionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFunctionResource extends BaseResource<SandboxFunctionModel> {
  static model: ModelStaticWorkspaceAware<SandboxFunctionModel> =
    SandboxFunctionModel;
  pod: SpaceResource;

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionModel>,
    blob: Attributes<SandboxFunctionModel>,
    pod: SpaceResource
  ) {
    super(model, blob);
    this.pod = pod;
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
      pod,
      file,
      inputSchema,
      outputSchema,
    }: {
      pod: SpaceResource;
      file: FileResource;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionResource> {
    assert(pod.isProject(), "Sandbox functions can only belong to Pod spaces.");
    assert(
      pod.workspaceId === auth.getNonNullableWorkspace().id,
      "The Pod must belong to the authenticated workspace."
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
      file.useCaseMetadata?.spaceId === pod.sId,
      "The file must belong to the same Pod as the sandbox function."
    );

    const sandboxFunction = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        podId: pod.id,
        fileId: file.id,
        inputSchema,
        outputSchema,
      },
      { transaction }
    );

    return new this(this.model, sandboxFunction.get(), pod);
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

    const pods = await SpaceResource.fetchByModelIds(
      auth,
      Array.from(
        new Set(
          sandboxFunctions.map((sandboxFunction) => sandboxFunction.get().podId)
        )
      )
    );
    const accessiblePodsById = new Map(
      pods
        .filter((pod) => pod.isProject() && pod.canReadOrAdministrate(auth))
        .map((pod) => [pod.id, pod])
    );

    return sandboxFunctions.flatMap((sandboxFunction) => {
      const pod = accessiblePodsById.get(sandboxFunction.get().podId);
      if (!pod) {
        return [];
      }

      return [new this(this.model, sandboxFunction.get(), pod)];
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

  static async listByPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<SandboxFunctionResource[]> {
    if (!pod.isProject()) {
      return [];
    }

    return this.baseFetch(auth, { where: { podId: pod.id } });
  }

  static async deleteAllForPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<number, Error>> {
    assert(pod.isProject(), "Sandbox functions can only belong to Pod spaces.");

    const sandboxFunctions = await this.listByPod(auth, pod);
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

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      if (!this.pod.canReadOrAdministrate(auth)) {
        return new Err(new Error("Sandbox function Pod is not accessible."));
      }

      const file = await FileResource.fetchByModelIdWithAuth(auth, this.fileId);
      if (!file) {
        return new Err(new Error("Sandbox function file not found."));
      }

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

      return file.delete(auth);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
