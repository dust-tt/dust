import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("group manager member usage", () => {
  it("restricts search to managed members before filtering and pagination", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const delegate = await UserFactory.basic();
    const member = await UserFactory.basic();
    const outsider = await UserFactory.basic();
    for (const user of [delegate, member, outsider]) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
    }
    const managedGroup = await GroupResource.makeNew(
      { name: "Support", kind: "regular_manual", workspaceId: workspace.id },
      { memberIds: [member.id] }
    );
    const otherGroup = await GroupResource.makeNew(
      { name: "Sales", kind: "regular_manual", workspaceId: workspace.id },
      { memberIds: [outsider.id] }
    );
    const search = vi
      .spyOn(UserResource, "searchUsers")
      .mockResolvedValue(new Ok({ users: [], total: 0 }));
    const page = MembersUsagePaginationSchema.parse({ search: "test" });

    let auth = await Authenticator.fromUserIdAndWorkspaceId(
      delegate.sId,
      workspace.sId
    );
    expect(
      await getMembersUsage({ auth, paginationParams: page })
    ).toMatchObject({
      members: [],
      total: 0,
    });
    expect(search).not.toHaveBeenCalled();

    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: delegate.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: managedGroup.id,
    });
    expect(grant.isOk()).toBe(true);
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      delegate.sId,
      workspace.sId
    );

    await getMembersUsage({ auth, paginationParams: page });
    expect(search).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ restrictToUserIds: [member.sId] })
    );

    search.mockClear();
    expect(
      await getMembersUsage({
        auth,
        paginationParams: MembersUsagePaginationSchema.parse({
          groupId: otherGroup.sId,
        }),
      })
    ).toMatchObject({ members: [], total: 0 });
    expect(search).not.toHaveBeenCalled();
  });
});
