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
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction } from "sequelize";

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
