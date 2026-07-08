import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolOutputItemType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  deleteContentsFromGcs,
  MCP_OUTPUT_ITEMS_PREFIX,
} from "@app/lib/resources/agent_mcp_action/output_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { SandboxFunctionMCPActionModel } from "@app/lib/resources/storage/models/sandbox_function_mcp_action";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withRetry } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { SandboxFunctionMCPActionType } from "@app/types/api/sandbox_functions";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

// Outputs share the agent MCP output items GCS prefix (`w/<wsId>/...` so workspace relocation
// transfers the objects), but with one object per action holding the full content array — dsbx
// consumes the output exactly once as a whole, there is no per-block rendering.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFunctionMCPActionResource
  extends ReadonlyAttributesType<SandboxFunctionMCPActionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFunctionMCPActionResource extends BaseResource<SandboxFunctionMCPActionModel> {
  static model: ModelStaticWorkspaceAware<SandboxFunctionMCPActionModel> =
    SandboxFunctionMCPActionModel;

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionMCPActionModel>,
    blob: Attributes<SandboxFunctionMCPActionModel>
  ) {
    super(model, blob);
  }

  get sId(): string {
    return SandboxFunctionMCPActionResource.modelIdToSId({
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
    return makeSId("sandbox_function_mcp_action", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    {
      invocation,
      mcpServerView,
      toolName,
      inputs,
      toolConfiguration,
    }: {
      invocation: SandboxFunctionInvocationResource;
      mcpServerView: MCPServerViewResource;
      toolName: string;
      inputs: Record<string, unknown>;
      toolConfiguration: LightMCPToolConfigurationType;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionMCPActionResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    // Cross-workspace resources would make the workspace-scoped deletion paths miss the row,
    // leaving the RESTRICT FKs to fire on invocation/view deletion.
    assert(
      invocation.workspaceId === workspaceId &&
        mcpServerView.workspaceId === workspaceId,
      "Invocation and MCP server view must belong to the authenticated workspace."
    );

    const action = await this.model.create(
      {
        workspaceId,
        sandboxFunctionInvocationId: invocation.id,
        mcpServerViewId: mcpServerView.id,
        toolName,
        inputs,
        toolConfiguration,
        status: "running",
      },
      { transaction }
    );

    return new this(this.model, action.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SandboxFunctionMCPActionModel>
  ): Promise<SandboxFunctionMCPActionResource[]> {
    const { where, ...rest } = options ?? {};
    const actions = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return actions.map((action) => new this(this.model, action.get()));
  }

  static async fetchById(
    auth: Authenticator,
    actionId: string
  ): Promise<SandboxFunctionMCPActionResource | null> {
    if (!isResourceSId("sandbox_function_mcp_action", actionId)) {
      return null;
    }

    const actionModelId = getResourceIdFromSId(actionId);
    if (actionModelId === null) {
      return null;
    }

    const [action] = await this.baseFetch(auth, {
      where: { id: actionModelId },
    });

    return action ?? null;
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<SandboxFunctionMCPActionResource | null> {
    const [action] = await this.baseFetch(auth, { where: { id } });

    return action ?? null;
  }

  async markAsSucceeded({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({ status: "succeeded", executionDurationMs });
  }

  async markAsErrored({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({ status: "errored", executionDurationMs });
  }

  private outputGcsPathFor(auth: Authenticator): string {
    return `w/${auth.getNonNullableWorkspace().sId}/${MCP_OUTPUT_ITEMS_PREFIX}/${this.sId}/output.json`;
  }

  // Writes the full content array to a single GCS object and records its path on the row. Written
  // exactly once, at tool completion. Returns the stored contents in the generic tool output item
  // shape shared with AgentMCPActionResource.createOutputItems.
  async createOutputItems(
    auth: Authenticator,
    contents: Array<{
      content: CallToolResult["content"][number];
      fileId?: ModelId;
    }>
  ): Promise<Result<ToolOutputItemType[], Error>> {
    const gcsPath = this.outputGcsPathFor(auth);
    const file = getPrivateUploadBucket().file(gcsPath);
    const json = JSON.stringify(contents.map((c) => c.content));

    const writeResult = await withRetry(() =>
      file.save(Buffer.from(json, "utf-8"), {
        contentType: "application/json",
      })
    );
    if (writeResult.isErr()) {
      logger.error(
        { err: writeResult.error, actionId: this.sId, gcsPath },
        "Failed to write sandbox function MCP action output to GCS"
      );
      return new Err(writeResult.error);
    }

    // When the row never got the path (update threw, or the row was deleted concurrently and
    // update affected 0 rows): best-effort delete the just-written object so the later row-driven
    // GCS cleanup does not miss it.
    const deleteOrphanedOutput = async () => {
      const gcsResult = await deleteContentsFromGcs([gcsPath]);
      if (gcsResult.isErr()) {
        logger.error(
          { err: gcsResult.error, actionId: this.sId, gcsPath },
          "Failed to delete orphaned sandbox function MCP action output from GCS"
        );
      }
    };

    try {
      const [affectedCount] = await this.update({ outputGcsPath: gcsPath });
      if (affectedCount === 0) {
        await deleteOrphanedOutput();
        return new Err(
          new Error("Sandbox function MCP action row no longer exists.")
        );
      }
    } catch (err) {
      await deleteOrphanedOutput();
      return new Err(normalizeError(err));
    }

    return new Ok(
      contents.map((c) => ({
        content: c.content,
        fileId: c.fileId ?? null,
        file: null,
        workspaceId: this.workspaceId,
      }))
    );
  }

  async readOutput(): Promise<Result<CallToolResult["content"] | null, Error>> {
    if (!this.outputGcsPath) {
      return new Ok(null);
    }

    try {
      const file = getPrivateUploadBucket().file(this.outputGcsPath);
      const [buffer] = await file.download();

      return new Ok(JSON.parse(buffer.toString("utf-8")));
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // GCS objects are deleted best-effort AFTER the rows (post-commit when a transaction is
  // provided): a failed or rolled-back row deletion must not leave rows pointing at deleted
  // objects, while a failed GCS deletion only logs — the orphaned object is harmless.
  private static async deleteAllWithOutputs(
    where: {
      workspaceId: ModelId;
      id?: ModelId;
      sandboxFunctionInvocationId?: ModelId | ModelId[];
      mcpServerViewId?: ModelId[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    const actions = await this.model.findAll({
      attributes: ["outputGcsPath"],
      where: {
        ...where,
        outputGcsPath: { [Op.ne]: null },
      },
      transaction,
    });

    const gcsPaths = removeNulls(actions.map((action) => action.outputGcsPath));

    const destroyedCount = await this.model.destroy({ where, transaction });

    const deleteFromGcs = async () => {
      const gcsResult = await deleteContentsFromGcs(gcsPaths);
      if (gcsResult.isErr()) {
        logger.error(
          { err: gcsResult.error, pathCount: gcsPaths.length },
          "Failed to delete sandbox function MCP action outputs from GCS"
        );
      }
    };

    if (transaction) {
      // Same shape as `invalidateAfterCommit` in `lib/utils/cache.ts`: the callback never rejects
      // today, but an unhandled rejection post-commit would be unattributable.
      transaction.afterCommit(() =>
        deleteFromGcs().catch((err) => {
          logger.error(
            { err: normalizeError(err), pathCount: gcsPaths.length },
            "Failed to delete sandbox function MCP action outputs from GCS after commit"
          );
        })
      );
    } else {
      await deleteFromGcs();
    }

    return destroyedCount;
  }

  static async deleteAllForInvocation(
    auth: Authenticator,
    invocation: SandboxFunctionInvocationResource,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    return this.deleteAllWithOutputs(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionInvocationId: invocation.id,
      },
      { transaction }
    );
  }

  static async deleteAllForSandboxFunction(
    sandboxFunction: SandboxFunctionResource,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    const invocationIds = (
      await SandboxFunctionInvocationModel.findAll({
        attributes: ["id"],
        where: {
          sandboxFunctionId: sandboxFunction.id,
          workspaceId: sandboxFunction.workspaceId,
        },
        transaction,
      })
    ).map((invocation) => invocation.id);

    if (invocationIds.length === 0) {
      return 0;
    }

    return this.deleteAllWithOutputs(
      {
        workspaceId: sandboxFunction.workspaceId,
        sandboxFunctionInvocationId: invocationIds,
      },
      { transaction }
    );
  }

  static async deleteAllForMCPServerViews(
    auth: Authenticator,
    {
      mcpServerViewIds,
      transaction,
    }: { mcpServerViewIds: ModelId[]; transaction?: Transaction }
  ): Promise<number> {
    return this.deleteAllWithOutputs(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewIds,
      },
      { transaction }
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await SandboxFunctionMCPActionResource.deleteAllWithOutputs(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        { transaction }
      );

      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toJSON(): SandboxFunctionMCPActionType {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      invocationId: makeSId("sandbox_function_invocation", {
        id: this.sandboxFunctionInvocationId,
        workspaceId: this.workspaceId,
      }),
      toolName: this.toolName,
      inputs: this.inputs,
      status: this.status,
      executionDurationMs: this.executionDurationMs,
    };
  }
}
