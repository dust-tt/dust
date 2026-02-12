import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * This helper sets up a test workspace with a user and membership.
 */
export const createResourceTest: ({
  role,
  isSuperUser,
}: {
  role?: MembershipRoleType;
  isSuperUser?: boolean;
}) => Promise<{
  workspace: LightWorkspaceType;
  user: UserResource;
  membership: MembershipResource;
  globalGroup: GroupResource;
  systemGroup: GroupResource;
  globalSpace: SpaceResource;
  systemSpace: SpaceResource;
  conversationsSpace: SpaceResource;
  authenticator: Authenticator;
}> = async ({
  role = "user",
  isSuperUser = false,
}: {
  role?: MembershipRoleType;
  isSuperUser?: boolean;
}) => {
  const workspace = await WorkspaceFactory.basic();
  const user: UserResource = await (isSuperUser
    ? UserFactory.superUser()
    : UserFactory.basic());

  const {
    globalGroup,
    systemGroup,
    globalSpace,
    systemSpace,
    conversationsSpace,
  } = await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const membership = await MembershipFactory.associate(workspace, user, {
    role,
  });

  return {
    workspace,
    user,
    membership,
    globalGroup,
    systemGroup,
    globalSpace,
    systemSpace,
    conversationsSpace,
    authenticator: await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    ),
  };
};
