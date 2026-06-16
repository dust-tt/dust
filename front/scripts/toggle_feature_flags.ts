import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";

async function enableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  const isEnabled = await FeatureFlagResource.isEnabledForWorkspace(
    workspace,
    featureFlag
  );
  if (isEnabled) {
    console.log(
      `Workspace ${name}(${workspaceId}) already has ${featureFlag} enabled -- Skipping.`
    );
    return;
  }

  if (execute) {
    await FeatureFlagResource.enable(workspace, featureFlag);

    // The flag may unlock auto internal MCP servers; create their views now so warmed pods
    // (whose hydration caches still mark the workspace as in sync) see them immediately.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} enabled for workspace: ${name}(${workspaceId}).`
  );
}

async function disableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  if (execute) {
    const isEnabled = await FeatureFlagResource.isEnabledForWorkspace(
      workspace,
      featureFlag
    );
    if (!isEnabled) {
      console.log(
        `Workspace ${name}(${workspaceId}) does not have ${featureFlag} enabled -- Skipping.`
      );
      return;
    }

    await FeatureFlagResource.disable(workspace, featureFlag);
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} disabled for workspace: ${name}(${workspaceId}).`
  );
}

makeScript(
  {
    enable: {
      type: "boolean",
      default: false,
    },
    featureFlag: {
      type: "string",
      choices: WHITELISTABLE_FEATURES,
      demandOption: true,
    },
    workspaceIds: {
      type: "array",
      demandOption: true,
      description:
        "List of workspace identifiers, separated by a space, for which the feature flag should be toggled.",
    },
  },
  async ({ enable, featureFlag, workspaceIds, execute }) => {
    for (const wId of workspaceIds) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        console.log(`Workspace ${wId} not found -- Skipping.`);
        continue;
      }

      if (enable) {
        await enableFeatureFlag(
          workspace,
          featureFlag as WhitelistableFeature,
          execute
        );
      } else {
        await disableFeatureFlag(
          workspace,
          featureFlag as WhitelistableFeature,
          execute
        );
      }
    }
  }
);
