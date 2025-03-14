import {
  getAuth0ManagemementClient,
  getAuth0UsersFromEmail,
} from "@app/lib/api/auth0";
import { createPlugin } from "@app/lib/api/poke/types";
import { isEmailValid } from "@app/lib/utils";
import { Err, Ok } from "@app/types";

export const deleteAuth0UserPlugin = createPlugin({
  manifest: {
    id: "delete-auth0-user",
    name: "Delete Auth0 User",
    description: "Delete a user from Auth0.",
    resourceTypes: ["global"],
    args: {
      email: {
        type: "string",
        label: "Email",
        description: "The email of the user to delete",
      },
    },
  },
  execute: async (auth, _, args) => {
    const email = args.email.trim();
    if (isEmailValid(email) === false) {
      return new Err(new Error("Email address is invalid."));
    }

    const [auth0User] = await getAuth0UsersFromEmail([email]);
    if (!auth0User) {
      return new Err(new Error("User not found in Auth0."));
    }

    await getAuth0ManagemementClient().users.delete({
      id: auth0User.user_id,
    });

    return new Ok({
      display: "text",
      value: "User deleted from Auth0.",
    });
  },
});
