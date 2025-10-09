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
        description:
          "Email(s) of the user(s) to invite (comma-separated for bulk invites)",
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

    // Parse comma-separated emails and trim whitespace.
    const emails = args.email
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      return new Err(new Error("At least one email address is required."));
    }

    // Validate all email addresses before proceeding.
    const invalidEmails = emails.filter((email) => !isEmailValid(email));
    if (invalidEmails.length > 0) {
      return new Err(
        new Error(`Invalid email address(es): ${invalidEmails.join(", ")}`)
      );
    }

    const invitationRes = await handleMembershipInvitations(auth, {
      owner: auth.getNonNullableWorkspace(),
      user: auth.getNonNullableUser().toJSON(),
      subscription,
      force: args.force,
      invitationRequests: emails.map((email) => ({
        email,
        role: args.role[0] as MembershipRoleType,
      })),
    });

    if (invitationRes.isErr()) {
      return new Err(new Error(invitationRes.error.api_error.message));
    }

    const successes = invitationRes.value.filter((r) => r.success);
    const failures = invitationRes.value.filter((r) => !r.success);

    const results: string[] = [];

    if (successes.length > 0) {
      results.push(
        `Successfully invited ${successes.length} user(s): ${successes.map((r) => r.email).join(", ")}`
      );
    }

    if (failures.length > 0) {
      results.push(
        `Failed to invite ${failures.length} user(s):`,
        ...failures.map((r) => `  - ${r.email}: ${r.error_message}`)
      );
    }

    // Return an error if all invitations failed.
    if (successes.length === 0) {
      return new Err(new Error(results.join("\n")));
    }

    return new Ok({
      display: "text",
      value: results.join("\n"),
    });
  },
});
