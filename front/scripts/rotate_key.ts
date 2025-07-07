import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    keyId: {
      type: "string",
      demandOption: true,
      description: "The ID of the key to rotate.",
    },
    workspaceId: {
      type: "number",
      demandOption: true,
      description: "The ID of the workspace containing the key.",
    },
  },

  async ({ keyId, workspaceId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    if (!workspace) {
      logger.error("Workspace not found.");
      return;
    }

    const lightWorkspace = renderLightWorkspaceType({
      workspace,
      role: "none",
    });

    const keyToRotate = await KeyResource.fetchByWorkspaceAndId(
      lightWorkspace,
      keyId
    );

    if (!keyToRotate) {
      logger.error("Key not found.");
      return;
    }

    if (execute) {
      const result = await keyToRotate.rotateSecret();
      if (result[0] === 1) {
        logger.info({ keyId }, "rotated key");
      } else {
        logger.error({ keyId }, "failed to rotate key");
      }
    } else {
      logger.info({ keyId }, "Would rotate key.");
    }
  }
);
