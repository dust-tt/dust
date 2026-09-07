import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SpaceUsersWithoutAccess } from "@app/types/api/spaces";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SpaceAccessCheckErrorType =
  | "space_not_found"
  | "space_unauthorized";

export class SpaceAccessCheckError extends Error {
  constructor(
    readonly type: SpaceAccessCheckErrorType,
    readonly spaceIds: string[]
  ) {
    super(`${type}: ${spaceIds.join(", ")}`);
  }
}

const NO_SPACES: ReadonlySet<ModelId> = new Set();

export interface UserWithoutSpaceAccess {
  user: UserResource;
  spaces: SpaceResource[];
}

/**
 * For each of `users`, the spaces among `spaces` they cannot read.
 *
 * Unlike {@link listUsersWithoutAccessToSpaces} this takes already-fetched resources and performs
 * no permission check of its own: it is meant for callers that already hold the spaces (skill
 * requirements, editor lists, project agent mention checks) and that have established their own
 * access separately. Users are assumed to be active workspace members.
 */
export async function listUsersWithoutAccessToSpaceResources(
  auth: Authenticator,
  { spaces, users }: { spaces: SpaceResource[]; users: UserResource[] }
): Promise<UserWithoutSpaceAccess[]> {
  if (spaces.length === 0 || users.length === 0) {
    return [];
  }

  const memberSpacesByUser = await SpaceResource.listMemberSpaceModelIdsByUser(
    auth,
    { spaces, userModelIds: users.map((user) => user.id) }
  );

  return users.flatMap((user) => {
    const memberSpaceIds = memberSpacesByUser.get(user.id) ?? NO_SPACES;
    const unreadableSpaces = spaces.filter(
      (space) => !memberSpaceIds.has(space.id)
    );

    return unreadableSpaces.length > 0
      ? [{ user, spaces: unreadableSpaces }]
      : [];
  });
}

/**
 * For each requested space, the requested users that are not members of it.
 *
 * Membership is the ground truth for read access on restricted spaces: their
 * `requestedPermissions()` grant `read` to group members only, so a user who is
 * not a member cannot see the space's data — not even a workspace admin, who
 * gets `admin` without `read`.
 *
 * Errors out on any space the caller cannot read or administrate, rather than
 * silently dropping it: a partial answer would read as "everyone has access".
 */
export async function listUsersWithoutAccessToSpaces(
  auth: Authenticator,
  { spaceIds, userIds }: { spaceIds: string[]; userIds: string[] }
): Promise<Result<SpaceUsersWithoutAccess[], SpaceAccessCheckError>> {
  const workspace = auth.getNonNullableWorkspace();

  const spaces = await SpaceResource.fetchByIds(auth, spaceIds);

  const fetchedSpaceIds = new Set(spaces.map((space) => space.sId));
  const notFoundSpaceIds = spaceIds.filter((id) => !fetchedSpaceIds.has(id));
  if (notFoundSpaceIds.length > 0) {
    return new Err(
      new SpaceAccessCheckError("space_not_found", notFoundSpaceIds)
    );
  }

  const unauthorizedSpaceIds = spaces
    .filter((space) => !auth.can("read", space) && !auth.can("admin", space))
    .map((space) => space.sId);
  if (unauthorizedSpaceIds.length > 0) {
    return new Err(
      new SpaceAccessCheckError("space_unauthorized", unauthorizedSpaceIds)
    );
  }

  // Users without an active membership in the workspace have no access to any of
  // its spaces, and neither do unknown user ids. Both fall through to the
  // `usersWithoutMembership` bucket below.
  const users = await UserResource.fetchByIds(userIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace,
  });
  const activeUserModelIds = new Set(memberships.map((m) => m.userId));
  const workspaceUsers = users.filter((user) =>
    activeUserModelIds.has(user.id)
  );

  const workspaceUserIds = new Set(workspaceUsers.map((user) => user.sId));
  const usersWithoutMembership = userIds.filter(
    (userId) => !workspaceUserIds.has(userId)
  );

  const memberSpacesByUser = await SpaceResource.listMemberSpaceModelIdsByUser(
    auth,
    { spaces, userModelIds: workspaceUsers.map((user) => user.id) }
  );

  return new Ok(
    spaces.map((space) => ({
      spaceId: space.sId,
      userIdsWithoutAccess: [
        ...usersWithoutMembership,
        ...workspaceUsers
          .filter(
            (user) =>
              !(memberSpacesByUser.get(user.id) ?? NO_SPACES).has(space.id)
          )
          .map((user) => user.sId),
      ],
    }))
  );
}
