import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types";

/**
 * This helper sets up a test workspace with a user and membership.
 */
export const createResourceTest = async ({
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
