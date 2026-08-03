import type { Authenticator } from "@app/lib/auth";
import type { PokeRole } from "@app/lib/poke/roles";
import {
  loadRolesForEditing,
  normalizeEmail,
  writeRoles,
} from "@app/lib/poke/roles";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export interface SuperuserMemberInfo {
  sId: string;
  email: string;
  fullName: string;
  membershipRole: string;
  isDustSuperUser: boolean;
  hasPokeRoleEntry: boolean;
  pokeRoles: PokeRole[];
}

export interface OrphanedPokeRoleEntry {
  email: string;
  pokeRoles: PokeRole[];
}

export interface PokeGetSuperusers {
  members: SuperuserMemberInfo[];
  orphanedRoleEntries: OrphanedPokeRoleEntry[];
}

export class SuperuserAdminError extends Error {
  constructor(
    public readonly type: "not_found" | "not_active_member",
    message: string
  ) {
    super(message);
  }
}

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

export async function listSuperuserMembers(
  auth: Authenticator
): Promise<PokeGetSuperusers> {
  const workspace = renderLightWorkspaceType({
    workspace: auth.getNonNullableWorkspace(),
  });
  const [{ memberships }, rolesConfig] = await Promise.all([
    MembershipResource.getActiveMemberships({ workspace }),
    loadRolesForEditing(),
  ]);

  const userModelIds = memberships
    .map((membership) => membership.userId)
    .filter((id): id is number => id !== undefined);
  const users = await UserResource.fetchByModelIds(userModelIds);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const activeEmails = new Set(users.map((user) => normalizeEmail(user.email)));

  const members = memberships.flatMap((membership) => {
    const user = usersById.get(membership.userId);
    if (!user) {
      return [];
    }
    const email = normalizeEmail(user.email);
    return [
      {
        sId: user.sId,
        email: user.email,
        fullName: user.fullName(),
        membershipRole: membership.role,
        isDustSuperUser: user.isDustSuperUser,
        hasPokeRoleEntry: email in rolesConfig,
        pokeRoles: rolesConfig[email] ?? [],
      },
    ];
  });

  const orphanedRoleEntries = Object.entries(rolesConfig)
    .filter(([email]) => !activeEmails.has(email))
    .map(([email, pokeRoles]) => ({ email, pokeRoles }));

  members.sort((a, b) => a.email.localeCompare(b.email));
  orphanedRoleEntries.sort((a, b) => a.email.localeCompare(b.email));

  return { members, orphanedRoleEntries };
}

export async function setPokeRoles(
  auth: Authenticator,
  email: string,
  roles: PokeRole[] | null
): Promise<{ email: string; previousRoles: PokeRole[]; newRoles: PokeRole[] }> {
  const normalized = normalizeEmail(email);
  const rolesConfig = await loadRolesForEditing();
  const previousRoles = rolesConfig[normalized] ?? [];

  if (roles === null) {
    delete rolesConfig[normalized];
  } else {
    const user = await UserResource.fetchByEmail(normalized);
    if (!user) {
      throw new SuperuserAdminError("not_found", "User not found.");
    }
    if (!(await isActiveWorkspaceMember(auth, user))) {
      throw new SuperuserAdminError(
        "not_active_member",
        "User is not an active member of the Dust workspace."
      );
    }
    rolesConfig[normalized] = roles;
  }

  await writeRoles(rolesConfig);
  return { email: normalized, previousRoles, newRoles: roles ?? [] };
}

export async function setDustSuperUser(
  auth: Authenticator,
  userSId: string,
  isDustSuperUser: boolean
): Promise<{
  email: string;
  userSId: string;
  previousValue: boolean;
  newValue: boolean;
}> {
  const user = await UserResource.fetchById(userSId);
  if (!user) {
    throw new SuperuserAdminError("not_found", "User not found.");
  }
  if (!(await isActiveWorkspaceMember(auth, user))) {
    throw new SuperuserAdminError(
      "not_active_member",
      "User is not an active member of the Dust workspace."
    );
  }

  const previousValue = user.isDustSuperUser;
  if (previousValue !== isDustSuperUser) {
    await user.setDustSuperUser(isDustSuperUser);
  }

  return {
    email: user.email,
    userSId: user.sId,
    previousValue,
    newValue: isDustSuperUser,
  };
}
