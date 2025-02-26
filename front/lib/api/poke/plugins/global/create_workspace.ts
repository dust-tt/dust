import { Err, Ok } from "@dust-tt/types";

import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isEmailValid } from "@app/lib/utils";

export const createWorkspacePlugin = createPlugin({
  manifest: {
    id: "create-workspace",
    name: "Create Workspace",
    description: `Create a new workspace in ${getRegionDisplay(config.getCurrentRegion())}.`,
    resourceTypes: ["global"],
    args: {
      name: {
        type: "string",
        label: "Name",
        description: "The name of the workspace",
      },
      email: {
        type: "string",
        label: "Email",
        description: "The email of the admin user",
      },
      enableAutoJoin: {
        type: "boolean",
        label: "Enable Auto Join",
        description: "Enable auto join for the domain",
      },
      isBusiness: {
        type: "boolean",
        label: "Is Business",
        description: "Is the workspace a business workspace (Pro plan 39€)",
      },
    },
  },
  execute: async (auth, _, args) => {
    const { enableAutoJoin = false } = args;

    const email = args.email.trim();
    if (isEmailValid(email) === false) {
      return new Err(new Error("Email address is invalid."));
    }

    const name = args.name.trim();
    if (name.length === 0) {
      return new Err(new Error("Name is required."));
    }

    const workspace = await createWorkspaceInternal({
      email,
      name,
      isVerified: enableAutoJoin,
      isBusiness: args.isBusiness,
    });

    const newWorkspaceAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const subscription = newWorkspaceAuth.subscription();
    if (!subscription) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    const invitationRes = await handleMembershipInvitations(newWorkspaceAuth, {
      owner: newWorkspaceAuth.getNonNullableWorkspace(),
      // Dust admin user who invited the new user.
      user: auth.getNonNullableUser(),
      subscription,
      invitationRequests: [
        {
          email,
          role: "admin",
        },
      ],
    });

    if (invitationRes.isErr()) {
      return new Err(new Error(invitationRes.error.api_error.message));
    }

    const [result] = invitationRes.value;
    if (!result.success) {
      return new Err(new Error(result.error_message));
    }

    return new Ok({
      display: "text",
      value: `Workspace created (id: ${workspace.sId}) and invitation sent to ${result.email}.`,
    });
  },
});
