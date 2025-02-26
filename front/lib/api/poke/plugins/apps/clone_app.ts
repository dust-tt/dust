import { Err, Ok } from "@dust-tt/types";
import assert from "assert";

import { cloneAppToWorkspace } from "@app/lib/api/apps";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

export const cloneAppPlugin = createPlugin({
  manifest: {
    id: "clone-app",
    name: "Clone App",
    description: "Clone an app to a target workspace and space",
    resourceTypes: ["apps"],
    args: {
      targetWorkspaceId: {
        type: "string",
        label: "Target Workspace ID",
        description: "ID of the workspace to clone the app to",
      },
      targetSpaceId: {
        type: "string",
        label: "Target Space ID",
        description: "ID of the space to clone the app to",
      },
    },
  },
  execute: async (auth, appId, args) => {
    assert(appId, "appId is required");

    const { targetSpaceId, targetWorkspaceId } = args;

    const app = await AppResource.fetchById(auth, appId);
    if (!app) {
      return new Err(new Error("App not found"));
    }

    const targetWorkspaceAuth =
      await Authenticator.internalAdminForWorkspace(targetWorkspaceId);

    const targetWorkspace = targetWorkspaceAuth.workspace();
    if (!targetWorkspace) {
      return new Err(new Error("Target workspace not found"));
    }

    const targetSpace = await SpaceResource.fetchById(
      targetWorkspaceAuth,
      targetSpaceId
    );
    if (!targetSpace) {
      return new Err(new Error("Target space not found"));
    }

    const cloneRes = await cloneAppToWorkspace(
      auth,
      app,
      targetWorkspace,
      targetSpace
    );

    if (cloneRes.isErr()) {
      return new Err(cloneRes.error);
    }

    return new Ok({
      display: "text",
      value: `App ${app.name} cloned successfully in workspace ${targetWorkspace.name}`,
    });
  },
});
