import {
  getAuth0ManagemementClient,
  getAuth0UsersFromEmail,
} from "@app/lib/api/auth0";
import { createPlugin } from "@app/lib/api/poke/types";
import { isEmailValid } from "@app/lib/utils";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types";

export const deleteAuth0UserPlugin = createPlugin({
  manifest: {
    id: "delete-auth0-user",
    name: "Delete Auth0 User",
    description: "Delete one or more users from Auth0.",
    resourceTypes: ["global"],
    args: {
      emails: {
        type: "text",
        label: "Emails",
        description:
          "Comma or newline separated list of emails of the users to delete",
      },
    },
  },
  execute: async (_auth, _resource, args) => {
    const emails = args.emails
      .split(/[\n,]/g)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      return new Err(new Error("At least one email is required."));
    }

    const invalidEmails = emails.filter((e) => !isEmailValid(e));
    if (invalidEmails.length > 0) {
      return new Err(
        new Error(`Invalid email addresses: ${invalidEmails.join(", ")}`)
      );
    }

    const auth0Users = await getAuth0UsersFromEmail(emails);
    const missingEmails = emails.filter(
      (e) =>
        !auth0Users.some(
          (u) => u.email && u.email.toLowerCase() === e.toLowerCase()
        )
    );

    if (missingEmails.length > 0) {
      return new Err(
        new Error(`Users not found in Auth0: ${missingEmails.join(", ")}`)
      );
    }

    for (const user of auth0Users) {
      await getAuth0ManagemementClient().users.delete({
        id: user.user_id,
      });
      await setTimeoutAsync(200);
    }

    return new Ok({
      display: "text",
      value: `Deleted ${auth0Users.length} user${
        auth0Users.length > 1 ? "s" : ""
      } from Auth0.`,
    });
  },
});
