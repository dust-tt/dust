import { createPlugin } from "@app/lib/api/poke/types";
import {
  addUserToWorkOSOrganization as addUserToOrganization,
  fetchUserFromWorkOS,
} from "@app/lib/api/workos/user";
import { isEmailValid } from "@app/lib/utils";
import { Err, Ok } from "@app/types/shared/result";

export const addUserToWorkOSOrganization = createPlugin({
  manifest: {
    id: "add-user-to-workos-organization",
    name: "Add User to WorkOS Organization",
    description:
      "Add a user to the WorkOS organization associated with this workspace",
    resourceTypes: ["workspaces"],
    args: {
      email: {
        type: "string",
        label: "Email",
        description: "Email of the user to add to the WorkOS organization",
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();

    if (!workspace.workOSOrganizationId) {
      return new Err(
        new Error("No WorkOS organization associated with this workspace")
      );
    }

    const email = args.email.trim();
    if (!isEmailValid(email)) {
      return new Err(new Error("Email address is invalid"));
    }

    // Fetch the user from WorkOS
    const userResult = await fetchUserFromWorkOS(email);
    if (userResult.isErr()) {
      return new Err(new Error(`User not found: ${userResult.error.message}`));
    }

    const workOSUser = userResult.value;

    const addUserResult = await addUserToOrganization(workspace, workOSUser);

    if (addUserResult.isOk()) {
      return new Ok({
        display: "text",
        value: `Successfully added user ${email} to WorkOS organization ${workspace.workOSOrganizationId}`,
      });
    } else {
      return new Err(
        new Error(
          `Failed to add user to organization: ${addUserResult.error.message}`
        )
      );
    }
  },
});
