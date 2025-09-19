import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { createPlugin } from "@app/lib/api/poke/types";
import { isEmailValid } from "@app/lib/utils";
import type { MembershipRoleType } from "@app/types";
import { Err, mapToEnumValues, MEMBERSHIP_ROLE_TYPES, Ok } from "@app/types";

export const inviteUser = createPlugin({
  manifest: {
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
        values: mapToEnumValues(MEMBERSHIP_ROLE_TYPES, (role) => ({
          label: role,
          value: role,
        })),
        multiple: false,
      },
      force: {
        type: "boolean",
        label: "Force",
        description:
          "If true, sends an email even if the user was already invited.",
        defaultValue: false,
      },
    },
  },
  execute: async (auth, _, args) => {
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
      user: auth.getNonNullableUser().toJSON(),
      subscription,
      force: args.force,
      invitationRequests: [
        {
          ...args,
          role: args.role[0] as MembershipRoleType,
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

    return new Ok({
      display: "text",
      value: `Invitation sent to ${result.email}.`,
    });
  },
});
