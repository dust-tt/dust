import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_CONCURRENCY = 4;

makeScript(
  {
    workspaceId: {
      type: "string",
      required: true,
      describe: "Restrict the backfill to a single workspace sId",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Number of invocations to process per database batch",
    },
    concurrency: {
      type: "number",
      default: DEFAULT_CONCURRENCY,
      describe: "Number of invocations to process concurrently per batch",
    },
  },
  async ({ execute, workspaceId, batchSize, concurrency }, logger) => {
    const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
    if (!workspaceResource) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    const workspace = renderLightWorkspaceType({
      workspace: workspaceResource,
    });
    const bucket = getPrivateUploadBucket();
    let lastInvocationModelId: ModelId | null = null;
    let backfilledCount = 0;

    for (;;) {
      const invocations: SandboxFunctionInvocationModel[] =
        await SandboxFunctionInvocationModel.findAll({
          // @ts-expect-error This migration intentionally queries rows from before the constraint.
          where: {
            workspaceId: workspace.id,
            gcsPath: null,
            ...(lastInvocationModelId
              ? { id: { [Op.gt]: lastInvocationModelId } }
              : {}),
          },
          order: [["id", "ASC"]],
          limit: batchSize,
        });

      if (invocations.length === 0) {
        break;
      }
      lastInvocationModelId = invocations[invocations.length - 1].id;

      await concurrentExecutor(
        invocations,
        async (invocation) => {
          const sandboxFunctionId = SandboxFunctionResource.modelIdToSId({
            id: invocation.sandboxFunctionId,
            workspaceId: workspace.id,
          });
          const invocationId = SandboxFunctionInvocationResource.modelIdToSId({
            id: invocation.id,
            workspaceId: workspace.id,
          });
          const gcsPath =
            `w/${workspace.sId}/sandbox_functions/${sandboxFunctionId}` +
            `/invocations/${invocationId}`;

          if (execute) {
            try {
              await bucket.uploadSmallRawContentToBucketAsNewFile({
                content: JSON.stringify({ version: 1 }),
                contentType: "application/json",
                filePath: gcsPath,
              });
            } catch (error) {
              // A concurrent invocation write wins over the empty backfill payload.
              if (!isGCSPreconditionFailedError(error)) {
                throw error;
              }
            }

            await SandboxFunctionInvocationModel.update(
              { gcsPath },
              {
                // @ts-expect-error This migration intentionally updates rows from before the constraint.
                where: {
                  id: invocation.id,
                  workspaceId: workspace.id,
                  gcsPath: null,
                },
                silent: true,
              }
            );
          }

          backfilledCount += 1;
        },
        { concurrency }
      );

      logger.info(
        {
          workspaceId: workspace.sId,
          lastInvocationModelId,
          backfilledCount,
          execute,
        },
        execute
          ? "Backfill batch completed"
          : "Backfill dry-run batch completed"
      );
    }
  }
);
