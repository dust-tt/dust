import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isEmailValid } from "@app/lib/utils";
import { Err, Ok } from "@app/types";

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
      planCode: {
        type: "string",
        label: "Plan Code",
        description: "The code of the plan to subscribe the workspace to",
        required: false,
      },
      endDate: {
        type: "string",
        label: "End Date (YYYY-MM-DD)",
        description: "The end date of the subscription",
        required: false,
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
      planCode: args.planCode,
      endDate: args.endDate ? new Date(args.endDate) : null,
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
      user: auth.getNonNullableUser().toJSON(),
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
      display: "textWithLink",
      value: `Workspace created (id: ${workspace.sId}) and invitation sent to ${result.email}.`,
      link: `poke/${workspace.sId}`,
      linkText: "View Workspace",
    });
  },
});
