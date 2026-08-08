import type { Authenticator } from "@app/lib/auth";
import type { RolesConfig } from "@app/lib/poke/roles";
import { writeRoles } from "@app/lib/poke/roles";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { normalizeEmail, type PokeRole } from "@app/types/poke/roles";
import { Err, Ok, type Result } from "@app/types/shared/result";

export type SuperuserMutationError =
  | { type: "not_found"; message: string }
  | { type: "not_active_member"; message: string };

async function isActiveWorkspaceMember(
  auth: Authenticator,
  user: UserResource
): Promise<boolean> {
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({
        workspace: auth.getNonNullableWorkspace(),
      }),
    });
  return membership !== null;
}

export async function listSuperuserMembers(auth: Authenticator) {
  const workspace = renderLightWorkspaceType({
    workspace: auth.getNonNullableWorkspace(),
  });
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const users = await UserResource.fetchByModelIds(
    memberships.flatMap((membership) =>
      membership.userId === undefined ? [] : [membership.userId]
    )
  );
  const usersById = new Map(users.map((user) => [user.id, user]));
  const members = memberships.flatMap((membership) => {
    const user = usersById.get(membership.userId);
    return user ? [user.toPokeSuperuserJSON(membership.role)] : [];
  });

  members.sort((a, b) => a.email.localeCompare(b.email));
  return members;
}

export async function setPokeRoles(
  auth: Authenticator,
  rolesConfig: RolesConfig,
  email: string,
  roles: PokeRole[] | null
): Promise<
  Result<
    { email: string; previousRoles: PokeRole[]; newRoles: PokeRole[] },
    SuperuserMutationError
  >
> {
  const normalized = normalizeEmail(email);
  const previousRoles = rolesConfig[normalized] ?? [];

  if (roles === null) {
    const nextRoles = { ...rolesConfig };
    delete nextRoles[normalized];
    await writeRoles(nextRoles);
    return new Ok({ email: normalized, previousRoles, newRoles: [] });
  }

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({ type: "not_found", message: "User not found." });
  }
  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: "User is not an active member of the Dust workspace.",
    });
  }

  await writeRoles({ ...rolesConfig, [normalized]: roles });
  return new Ok({ email: normalized, previousRoles, newRoles: roles });
}

export async function setDustSuperUser(
  auth: Authenticator,
  userId: string,
  isDustSuperUser: boolean
): Promise<
  Result<
    {
      email: string;
      userId: string;
      previousValue: boolean;
      newValue: boolean;
    },
    SuperuserMutationError
  >
> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Err({ type: "not_found", message: "User not found." });
  }
  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: "User is not an active member of the Dust workspace.",
    });
  }

  const previousValue = user.isDustSuperUser;
  if (previousValue !== isDustSuperUser) {
    await user.setDustSuperUser(isDustSuperUser);
  }
  return new Ok({
    email: user.email,
    userId: user.sId,
    previousValue,
    newValue: isDustSuperUser,
  });
}
