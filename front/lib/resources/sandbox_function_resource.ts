import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
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

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionModel>,
    blob: Attributes<SandboxFunctionModel>
  ) {
    super(model, blob);
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
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    assert(pod.isProject(), "Sandbox functions can only belong to Pod spaces.");
    assert(
      pod.workspaceId === workspaceModelId,
      "The Pod must belong to the authenticated workspace."
    );
    assert(
      file.workspaceId === workspaceModelId,
      "The file must belong to the authenticated workspace."
    );

    const sandboxFunction = await this.model.create(
      {
        workspaceId: workspaceModelId,
        podId: pod.id,
        fileId: file.id,
        inputSchema,
        outputSchema,
      },
      { transaction }
    );

    return new this(this.model, sandboxFunction.get());
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

    return sandboxFunctions.map(
      (sandboxFunction) => new this(this.model, sandboxFunction.get())
    );
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
    pod: SpaceResource,
    transaction?: Transaction
  ): Promise<number> {
    assert(pod.isProject(), "Sandbox functions can only belong to Pod spaces.");

    return this.model.destroy({
      where: {
        podId: pod.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}
