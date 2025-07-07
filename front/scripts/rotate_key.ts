import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { LightWorkspaceType } from "@app/types/user";

makeScript(
  {
    keyId: {
      type: "string",
      demandOption: true,
      description: "The ID of the key to rotate.",
    },
    workspaceSId: {
      type: "string",
      demandOption: true,
      description: "The sId of the workspace containing the key.",
    },
  },

  async ({ keyId, workspaceSId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceSId);
    if (!workspace) {
      logger.error("Workspace not found.");
      return;
    }

    const lightWorkspace: LightWorkspaceType = {
      ...workspace,
      role: "none",
    };

    const keyToRotate = await KeyResource.fetchByWorkspaceAndId(
      lightWorkspace,
      keyId
    );

    if (!keyToRotate) {
      logger.error("Key not found.");
      return;
    }

    if (keyToRotate.workspaceId !== workspace.id) {
      logger.error("Key not found in workspace.");
      return;
    }

    if (execute) {
      const result = await keyToRotate.updateSecret();
      if (result[0] === 1) {
        logger.info({ keyId }, "rotated key");
      } else {
        logger.error({ keyId }, "failed to rotate key");
      }
    } else {
      console.log("Would rotate key.");
    }
  }
);
