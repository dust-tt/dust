import { finalizeConnection } from "@app/lib/api/oauth";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("finalizeConnection", () => {
  it("returns an error instead of throwing when auth has no workspace", async () => {
    const user = await UserFactory.basic();
    const auth = new Authenticator({
      user,
      role: "none",
      permissions: GroupPermissions.empty(),
      workspace: null,
      subscription: null,
      authMethod: "session",
    });

    const res = await finalizeConnection(auth, "github", {});

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_finalization_failed");
    }
  });
});
