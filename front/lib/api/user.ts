import { Authenticator } from "@app/lib/auth";
import { RoleType } from "@app/lib/auth";
import { Membership, User } from "@app/lib/models";
import { UserType } from "@app/types/user";

/**
 * Returns the users of the workspace associated with the authenticator (without listing their own
 * workspaces).
 * @param auth Authenticator
 * @returns UserType[] users of the workspace
 */
export async function getUsers(auth: Authenticator): Promise<UserType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const memberships = await Membership.findAll({
    where: {
      workspaceId: owner.id,
    },
  });

  const users = await User.findAll({
    where: {
      id: memberships.map((m) => m.userId),
    },
  });

  return users.map((u) => {
    let m = memberships.find((m) => m.userId === u.id);
    let role = "none" as RoleType;
    if (m) {
      switch (m.role) {
        case "admin":
        case "builder":
        case "user":
          role = m.role;
          break;
        default:
          role = "none";
      }
    }

    return {
      id: u.id,
      provider: u.provider,
      providerId: u.providerId,
      username: u.username,
      email: u.email,
      name: u.name,
      image: null,
      workspaces: [],
    };
  });
}
