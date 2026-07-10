import { Op } from "sequelize";

import {
  getInternalMCPServerNameAndWorkspaceId,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

const TOOL_NAMES_BY_SERVER: Partial<
  Record<InternalMCPServerNameType, readonly string[]>
> = {
  files: ["delete"],
  github: ["update_issue"],
  gmail: ["set_message_labels"],
  google_drive: [
    "update_document",
    "append_to_spreadsheet",
    "update_spreadsheet",
    "update_presentation",
    "share_file",
    "update_file_permission",
    "revoke_file_sharing",
  ],
  luma: ["update_event", "update_guest_status", "send_invites"],
  microsoft_drive: ["rename_drive_item"],
  outlook: ["move_messages"],
  pod_manager: ["remove_content_node", "update_members"],
};

function shouldDowngradeToolMetadata(
  metadata: RemoteMCPServerToolMetadataModel
): boolean {
  if (!metadata.internalMCPServerId) {
    return false;
  }

  const serverNameResult = getInternalMCPServerNameAndWorkspaceId(
    metadata.internalMCPServerId
  );
  if (serverNameResult.isErr()) {
    return false;
  }

  const toolNames = TOOL_NAMES_BY_SERVER[serverNameResult.value.name];
  return toolNames?.includes(metadata.toolName) ?? false;
}

makeScript({}, async ({ execute }, logger) => {
  let matchedCount = 0;
  let updatedCount = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const mediumToolMetadata = await RemoteMCPServerToolMetadataModel.findAll({
      where: {
        workspaceId: workspace.id,
        permission: "medium",
      },
    });
    const metadataToDowngrade = mediumToolMetadata.filter(
      shouldDowngradeToolMetadata
    );

    if (metadataToDowngrade.length === 0) {
      return;
    }

    matchedCount += metadataToDowngrade.length;
    logger.info(
      {
        workspaceId: workspace.sId,
        metadataIds: metadataToDowngrade.map((metadata) => metadata.id),
        toolNames: metadataToDowngrade.map((metadata) => metadata.toolName),
      },
      execute
        ? "Downgrading unscoped medium tool metadata to low"
        : "Dry run: unscoped medium tool metadata to downgrade"
    );

    if (execute) {
      const [workspaceUpdatedCount] =
        await RemoteMCPServerToolMetadataModel.update(
          { permission: "low" },
          {
            where: {
              workspaceId: workspace.id,
              id: {
                [Op.in]: metadataToDowngrade.map((metadata) => metadata.id),
              },
            },
          }
        );
      updatedCount += workspaceUpdatedCount;
    }
  });

  logger.info(
    { execute, matchedCount, updatedCount },
    execute
      ? "Finished downgrading unscoped medium tool metadata"
      : "Dry run: finished listing unscoped medium tool metadata"
  );
});
