import { hash as blake3 } from "blake3";
import { v4 as uuidv4 } from "uuid";

import {
  KeyResource,
  SECRET_KEY_PREFIX,
} from "@app/lib/resources/key_resource";
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

    // Using the same method as the key creation script.
    // TODO (stephen): Move this to a shared function in the key resource.
    const newSecret = `${SECRET_KEY_PREFIX}${Buffer.from(blake3(uuidv4())).toString("hex").slice(0, 32)}`;

    if (!keyToRotate) {
      logger.error("Key not found.");
      return;
    }

    if (keyToRotate.workspaceId !== workspace.id) {
      logger.error("Key not found in workspace.");
      return;
    }

    await keyToRotate.model.update(
      { secret: newSecret },
      { where: { id: keyToRotate.id } }
    );

    if (execute) {
      logger.info({ keyId }, "rotated key");
    } else {
      logger.warn("Not executing");
    }
  }
);
