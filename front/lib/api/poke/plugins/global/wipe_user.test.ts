import assert from "node:assert";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteWorkOSUser, mockDeleteCustomerioUser } = vi.hoisted(() => ({
  mockDeleteWorkOSUser: vi.fn(),
  mockDeleteCustomerioUser: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    userManagement: { deleteUser: mockDeleteWorkOSUser },
  }),
}));

vi.mock("@app/lib/tracking/customerio/server", () => ({
  CustomerioServerSideTracking: { deleteUser: mockDeleteCustomerioUser },
}));

import { wipeUserPlugin } from "@app/lib/api/poke/plugins/global/wipe_user";
import { Authenticator } from "@app/lib/auth";
import {
  ANONYMIZED_USER_EMAIL_DOMAIN,
  UserResource,
} from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { NotFoundException } from "@workos-inc/node";

async function wipe(userId: string) {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return wipeUserPlugin.execute(auth, null, { userId, confirmWipe: true });
}

describe("wipeUserPlugin.execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteWorkOSUser.mockResolvedValue(undefined);
    mockDeleteCustomerioUser.mockResolvedValue(new Ok(undefined));
  });

  it("deletes the user from Customer.io and WorkOS and anonymizes its row", async () => {
    const user = await UserFactory.withWorkOSId("user_workos_to_wipe");
    await user.setMetadata("some_key", "some_value");

    const result = await wipe(user.sId);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
    expect(mockDeleteCustomerioUser).toHaveBeenCalledWith({
      email: user.email,
    });
    expect(mockDeleteWorkOSUser).toHaveBeenCalledWith("user_workos_to_wipe");

    const anonymized = await UserResource.fetchById(user.sId);
    assert(anonymized, "expected the user row to be kept");
    expect(anonymized.email).toBe(
      `${user.sId}@${ANONYMIZED_USER_EMAIL_DOMAIN}`
    );
    expect(anonymized.firstName).not.toBe(user.firstName);
    expect(anonymized.workOSUserId).toBeNull();
    await expect(anonymized.getMetadata("some_key")).resolves.toBeNull();
  });

  it("succeeds when the WorkOS user is already gone", async () => {
    const user = await UserFactory.withWorkOSId("user_workos_gone");
    mockDeleteWorkOSUser.mockRejectedValue(
      new NotFoundException({
        code: "entity_not_found",
        message: "User not found",
        path: "/user_management/users/user_workos_gone",
        requestID: "req_1",
      })
    );

    const result = await wipe(user.sId);

    assert(result.isOk(), result.isErr() ? result.error.message : "");
  });

  it("refuses a user with a membership", async () => {
    const user = await UserFactory.basic();
    const workspace = await WorkspaceFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const result = await wipe(user.sId);

    assert(result.isErr(), "expected the wipe to be refused");
    expect(result.error.message).toContain("membership");
    expect(mockDeleteCustomerioUser).not.toHaveBeenCalled();
    await expect(UserResource.fetchById(user.sId)).resolves.not.toBeNull();
  });

  it("refuses a user whose email is shared with another user", async () => {
    const user = await UserFactory.withEmail("shared@example.com");
    await UserFactory.withEmail("shared@example.com");

    const result = await wipe(user.sId);

    assert(result.isErr(), "expected the wipe to be refused");
    expect(mockDeleteCustomerioUser).not.toHaveBeenCalled();
  });

  it("refuses without confirmation", async () => {
    const user = await UserFactory.basic();
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await wipeUserPlugin.execute(auth, null, {
      userId: user.sId,
      confirmWipe: false,
    });

    expect(result.isErr()).toBe(true);
    await expect(UserResource.fetchById(user.sId)).resolves.not.toBeNull();
  });
});
