import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";
import type { ToolOutputItemType } from "@app/lib/actions/types";
import type { PokeSandboxFunctionMCPAction } from "@app/lib/api/poke/sandbox_functions";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  deleteContentsFromGcs,
  MCP_OUTPUT_ITEMS_PREFIX,
} from "@app/lib/resources/agent_mcp_action/output_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isRecord, removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

// Outputs share the agent MCP output items GCS prefix (`w/<wsId>/...` so workspace relocation
// transfers the objects), but with one object per action holding the full content array — dsbx
// consumes the output exactly once as a whole, there is no per-block rendering.

// The output object is either a bare content array (version 1, still the format when the tool
// result carries no structuredContent so readers of older deploys keep working) or a versioned
// envelope `{version: 2, content, structuredContent}`. `readOutput` reads both.
const OUTPUT_ENVELOPE_VERSION = 2;

export type SandboxFunctionMCPActionOutput = {
  content: CallToolResult["content"];
  structuredContent?: CallToolResult["structuredContent"];
};

function parseOutputObject(
  parsed: unknown
): Result<SandboxFunctionMCPActionOutput, Error> {
  // Version 1: a bare content array.
  if (Array.isArray(parsed)) {
    return new Ok({ content: parsed });
  }
  // Version 2 envelope. The object is written by `createOutputItems` below, so shape validation
  // stays a light guard (matching the trust level of the version-1 read path). The version is
  // checked so a future format bump fails loudly here instead of being silently misparsed.
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "version" in parsed &&
    parsed.version === OUTPUT_ENVELOPE_VERSION &&
    "content" in parsed &&
    Array.isArray(parsed.content)
  ) {
    const structuredContent =
      "structuredContent" in parsed &&
      parsed.structuredContent !== null &&
      typeof parsed.structuredContent === "object" &&
      isRecord(parsed.structuredContent)
        ? parsed.structuredContent
        : undefined;

    return new Ok({
      content: parsed.content,
      ...(structuredContent !== undefined ? { structuredContent } : {}),
    });
  }
  return new Err(
    new Error("Unrecognized sandbox function MCP action output format.")
  );
}

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

  // String identifier of the invocation this action belongs to.
  get invocationId(): string {
    return makeSId("sandbox_function_invocation", {
      id: this.sandboxFunctionInvocationId,
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
      status,
      idempotencyKey,
    }: {
      invocation: SandboxFunctionInvocationResource;
      mcpServerView: MCPServerViewResource;
      toolName: string;
      inputs: Record<string, unknown>;
      toolConfiguration: LightMCPToolConfigurationType;
      status: "running" | "blocked_validation_required";
      idempotencyKey?: string;
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
        status,
        idempotencyKey: idempotencyKey ?? null,
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

  // Most recent action created with this idempotency key for the invocation, if any within the
  // window. The key is scoped to (invocation, server view, tool): a key accidentally reused for a
  // different tool creates a fresh action rather than replaying an unrelated one, and reuse
  // across invocations never collides. Rides the (workspaceId, sandboxFunctionInvocationId)
  // index — an invocation only ever holds a handful of actions.
  static async fetchByIdempotencyKey(
    auth: Authenticator,
    {
      invocation,
      mcpServerView,
      toolName,
      idempotencyKey,
      createdAfter,
    }: {
      invocation: SandboxFunctionInvocationResource;
      mcpServerView: MCPServerViewResource;
      toolName: string;
      idempotencyKey: string;
      createdAfter: Date;
    }
  ): Promise<SandboxFunctionMCPActionResource | null> {
    const [action] = await this.baseFetch(auth, {
      where: {
        sandboxFunctionInvocationId: invocation.id,
        mcpServerViewId: mcpServerView.id,
        toolName,
        idempotencyKey,
        createdAt: { [Op.gte]: createdAfter },
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit: 1,
    });

    return action ?? null;
  }

  // Oldest-first: the actions of a single invocation, in the order the function called them.
  static async listByInvocation(
    auth: Authenticator,
    invocation: SandboxFunctionInvocationResource
  ): Promise<SandboxFunctionMCPActionResource[]> {
    return this.baseFetch(auth, {
      where: { sandboxFunctionInvocationId: invocation.id },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });
  }

  // Counts the actions of each invocation, keyed by invocation model id. Counting the fetched ids
  // in memory rather than grouping in SQL keeps the result typed; the row count is bounded by the
  // caller's page of invocations times their tool calls.
  static async countByInvocationModelIds(
    auth: Authenticator,
    invocationModelIds: ModelId[]
  ): Promise<Map<ModelId, number>> {
    const counts = new Map<ModelId, number>();
    if (invocationModelIds.length === 0) {
      return counts;
    }

    const actions = await this.model.findAll({
      attributes: ["sandboxFunctionInvocationId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sandboxFunctionInvocationId: invocationModelIds,
      },
    });

    for (const action of actions) {
      const invocationModelId = action.sandboxFunctionInvocationId;
      counts.set(invocationModelId, (counts.get(invocationModelId) ?? 0) + 1);
    }

    return counts;
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<SandboxFunctionMCPActionResource | null> {
    const [action] = await this.baseFetch(auth, { where: { id } });

    return action ?? null;
  }

  async updateStatus(
    status: ToolExecutionBaseStatus
  ): Promise<[affectedCount: number]> {
    return this.update({ status });
  }

  async markAsSucceeded({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({
      status: "succeeded",
      executionDurationMs: Math.round(executionDurationMs),
    });
  }

  async markAsErrored({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({
      status: "errored",
      executionDurationMs: Math.round(executionDurationMs),
    });
  }

  // Updates only if the action still has the expected status: a WHERE-guarded compare-and-swap,
  // so concurrent resolutions of a blocked action have exactly one winner.
  async updateStatusFromExpected(
    auth: Authenticator,
    {
      status,
      expectedStatus,
    }: {
      status: ToolExecutionBaseStatus;
      expectedStatus: ToolExecutionBaseStatus;
    }
  ): Promise<[affectedCount: number]> {
    return SandboxFunctionMCPActionModel.update(
      { status },
      {
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          status: expectedStatus,
        },
      }
    );
  }

  private outputGcsPathFor(auth: Authenticator): string {
    return `w/${auth.getNonNullableWorkspace().sId}/${MCP_OUTPUT_ITEMS_PREFIX}/${this.sId}/output.json`;
  }

  // Writes the full content array to a single GCS object and records its path on the row. Written
  // exactly once, at tool completion. Returns the stored contents in the generic tool output item
  // shape shared with AgentMCPActionResource.createOutputItems.
  // When the tool result carries a structuredContent payload, the object is a versioned envelope
  // instead of a bare array; see `parseOutputObject`.
  async createOutputItems(
    auth: Authenticator,
    contents: Array<{
      content: CallToolResult["content"][number];
      fileId?: ModelId;
    }>,
    options?: { structuredContent?: CallToolResult["structuredContent"] }
  ): Promise<Result<ToolOutputItemType[], Error>> {
    const gcsPath = this.outputGcsPathFor(auth);
    const file = getPrivateUploadBucket().file(gcsPath);
    const content = contents.map((c) => c.content);
    const json = JSON.stringify(
      options?.structuredContent !== undefined
        ? {
            version: OUTPUT_ENVELOPE_VERSION,
            content,
            structuredContent: options.structuredContent,
          }
        : content
    );

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

  async readOutput(): Promise<
    Result<SandboxFunctionMCPActionOutput | null, Error>
  > {
    if (!this.outputGcsPath) {
      return new Ok(null);
    }

    // Retry the download: the poll client treats an error response as terminal, so a transient
    // GCS failure here would permanently fail a tool call that actually succeeded.
    const gcsPath = this.outputGcsPath;
    const downloadResult = await withRetry(() =>
      getPrivateUploadBucket().file(gcsPath).download()
    );
    if (downloadResult.isErr()) {
      return new Err(downloadResult.error);
    }

    let parsed: unknown;
    try {
      const [buffer] = downloadResult.value;
      parsed = JSON.parse(buffer.toString("utf-8"));
    } catch (err) {
      return new Err(normalizeError(err));
    }

    return parseOutputObject(parsed);
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

  static async deleteAllForInvocationModelIds(
    {
      workspaceModelId,
      invocationModelIds,
    }: {
      workspaceModelId: ModelId;
      invocationModelIds: ModelId[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<number> {
    if (invocationModelIds.length === 0) {
      return 0;
    }

    return this.deleteAllWithOutputs(
      {
        workspaceId: workspaceModelId,
        sandboxFunctionInvocationId: invocationModelIds,
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
      invocationId: this.invocationId,
      toolName: this.toolName,
      inputs: this.inputs,
      status: this.status,
      executionDurationMs: this.executionDurationMs,
    };
  }

  // `mcpServerView` names the tool's server and links to it; it is null when the view has since
  // been deleted. The output itself stays behind `readOutput`, poke fetches it on demand.
  toPokeJSON(
    mcpServerView: MCPServerViewResource | null
  ): PokeSandboxFunctionMCPAction {
    return {
      ...this.toJSON(),
      mcpServerViewId: mcpServerView?.sId ?? null,
      mcpServerName: mcpServerView
        ? mcpServerView.getServerDisplayMetadata().name
        : null,
      hasOutput: this.outputGcsPath !== null,
    };
  }
}
