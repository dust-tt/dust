import { Err, MEMBERSHIP_ROLE_TYPES, Ok } from "@dust-tt/types";

import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { createPlugin } from "@app/lib/api/poke/types";
import { isEmailValid } from "@app/lib/utils";

export const inviteUser = createPlugin(
  {
    id: "invite-user",
    name: "Invite a user",
    description: "Invite a user to the workspace",
    resourceTypes: ["workspaces"],
    args: {
      email: {
        type: "string",
        label: "Email",
        description: "Email of the user to invite",
      },
      role: {
        type: "enum",
        label: "Role",
        description: "Role of the user to invite",
        values: MEMBERSHIP_ROLE_TYPES,
      },
    },
  },
  async (auth, resourceId, args) => {
    const subscription = auth.subscription();
    const plan = auth.plan();
    if (!subscription || !plan) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    if (subscription.paymentFailingSince) {
      return new Err(
        new Error(
          "The subscription payment has failed, impossible to add new members."
        )
      );
    }

    const email = args.email.trim();
    if (isEmailValid(email) === false) {
      return new Err(new Error("Email address is invalid."));
    }

    const invitationRes = await handleMembershipInvitations(auth, {
      owner: auth.getNonNullableWorkspace(),
      user: auth.getNonNullableUser(),
      subscription,
      invitationRequests: [
        {
          ...args,
          email,
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

    return new Ok(`Invitation sent to ${result.email}.`);
  }
);
