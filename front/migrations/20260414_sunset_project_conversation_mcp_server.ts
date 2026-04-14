import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  dangerouslyMakeSIdWithCustomFirstPrefix,
  LEGACY_REGION_BIT,
} from "@app/lib/resources/string_ids";
import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";

const TARGET_SERVER_NAME: AutoInternalMCPServerNameType =
  "project_conversation" as AutoInternalMCPServerNameType;
const TARGET_SERVER_ID = 1025;
const PROJECTS_FEATURE_FLAG: WhitelistableFeature = "projects";

async function deleteProjectConversationViewsFromWorkspace(
  workspaceId: string,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const mcpServerId = dangerouslyMakeSIdWithCustomFirstPrefix(
    "internal_mcp_server",
    {
      id: TARGET_SERVER_ID,
      workspaceId: auth.getNonNullableWorkspace().id,
      firstPrefix: LEGACY_REGION_BIT,
    }
  );

  const mcpServerViews = await MCPServerViewResource.listByMCPServer(
    auth,
    mcpServerId
  );
  const foundViewCount = mcpServerViews.length;

  const foundToolMetadataCount = await RemoteMCPServerToolMetadataModel.count({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      internalMCPServerId: mcpServerId,
    },
  });

  const foundUserToolApprovalCount = await UserToolApprovalModel.count({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerId,
    },
  });

  let deletedViewCount = 0;
  let deletedToolMetadataCount = 0;
  let deletedUserToolApprovalCount = 0;
  if (execute) {
    for (const view of mcpServerViews) {
      await view.hardDelete(auth);
    }
    deletedViewCount = foundViewCount;

    deletedToolMetadataCount = await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: mcpServerId,
      },
    });

    deletedUserToolApprovalCount = await UserToolApprovalModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerId,
      },
    });
  }

  return {
    foundViewCount,
    deletedViewCount,
    foundToolMetadataCount,
    deletedToolMetadataCount,
    foundUserToolApprovalCount,
    deletedUserToolApprovalCount,
    mcpServerId,
  };
}

async function listWorkspacesWithProjectsFeatureFlag(): Promise<
  LightWorkspaceType[]
> {
  const flags = await FeatureFlagModel.findAll({
    where: { name: PROJECTS_FEATURE_FLAG },
    attributes: ["workspaceId"],
    // @ts-expect-error -- Migration script needs to operate across all workspaces.
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const workspaceIds = [...new Set(flags.map((f) => f.workspaceId))];
  if (workspaceIds.length === 0) {
    return [];
  }

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceIds);
  return workspaces.map((workspace) => renderLightWorkspaceType({ workspace }));
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to run against a single workspace.",
    },
    fromWorkspaceId: {
      type: "number",
      describe: "Resume from this workspace model id (inclusive).",
    },
  },
  async ({ execute, wId, fromWorkspaceId }, logger) => {
    logger.info(
      {
        targetServerName: TARGET_SERVER_NAME,
        targetServerId: TARGET_SERVER_ID,
        execute,
      },
      execute
        ? "Deleting project_conversation MCP server views across workspaces"
        : "Dry run: listing project_conversation MCP server views across workspaces"
    );

    let totalFoundViews = 0;
    let totalDeletedViews = 0;
    let totalFoundToolMetadata = 0;
    let totalDeletedToolMetadata = 0;
    let totalFoundUserToolApprovals = 0;
    let totalDeletedUserToolApprovals = 0;
    let touchedWorkspaceCount = 0;

    const processWorkspace = async (workspace: LightWorkspaceType) => {
      const result = await deleteProjectConversationViewsFromWorkspace(
        workspace.sId,
        { execute }
      );

      if (
        result.foundViewCount === 0 &&
        result.foundToolMetadataCount === 0 &&
        result.foundUserToolApprovalCount === 0
      ) {
        return;
      }

      touchedWorkspaceCount += 1;
      totalFoundViews += result.foundViewCount;
      totalDeletedViews += result.deletedViewCount;
      totalFoundToolMetadata += result.foundToolMetadataCount;
      totalDeletedToolMetadata += result.deletedToolMetadataCount;
      totalFoundUserToolApprovals += result.foundUserToolApprovalCount;
      totalDeletedUserToolApprovals += result.deletedUserToolApprovalCount;

      logger.info(
        {
          workspaceId: workspace.sId,
          mcpServerId: result.mcpServerId,
          foundViewCount: result.foundViewCount,
          deletedViewCount: result.deletedViewCount,
          foundToolMetadataCount: result.foundToolMetadataCount,
          deletedToolMetadataCount: result.deletedToolMetadataCount,
          foundUserToolApprovalCount: result.foundUserToolApprovalCount,
          deletedUserToolApprovalCount: result.deletedUserToolApprovalCount,
        },
        execute
          ? "Deleted project_conversation server data for workspace"
          : "Dry run: would delete project_conversation server data for workspace"
      );
    };

    if (wId) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }

      const hasProjectsFlag = await FeatureFlagModel.findOne({
        where: {
          workspaceId: workspace.id,
          name: PROJECTS_FEATURE_FLAG,
        },
      });

      if (!hasProjectsFlag) {
        throw new Error(
          `Workspace ${wId} does not have the workspace-level "${PROJECTS_FEATURE_FLAG}" feature flag.`
        );
      }

      await processWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      let workspaces = await listWorkspacesWithProjectsFeatureFlag();
      if (fromWorkspaceId) {
        workspaces = workspaces.filter(
          (workspace) => workspace.id >= fromWorkspaceId
        );
      }

      logger.info(
        { workspaceCount: workspaces.length, fromWorkspaceId },
        "Running on workspaces with projects feature flag"
      );

      if (workspaces.length > 0) {
        await concurrentExecutor(workspaces, processWorkspace, {
          concurrency: 1,
        });
      }
    }

    logger.info(
      {
        targetServerName: TARGET_SERVER_NAME,
        targetServerId: TARGET_SERVER_ID,
        touchedWorkspaceCount,
        totalFoundViews,
        totalDeletedViews,
        totalFoundToolMetadata,
        totalDeletedToolMetadata,
        totalFoundUserToolApprovals,
        totalDeletedUserToolApprovals,
      },
      execute
        ? "Finished deleting project_conversation server data"
        : "Dry run complete for project_conversation server data deletion"
    );
  }
);
