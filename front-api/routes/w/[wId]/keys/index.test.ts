import { KeyResource } from "@app/lib/resources/key_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { redactString } from "@app/types/shared/utils/string_utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/keys — secret visibility", () => {
  it("returns the full secret to the admin who created the key", async () => {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const key = await KeyResource.makeNew(
      {
        name: "creator-key",
        workspaceId: workspace.id,
        userId: user.id,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      [globalGroup]
    );

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`);
    expect(res.status).toBe(200);

    const { keys } = await res.json();
    const returned = keys.find(
      (k: { name: string }) => k.name === "creator-key"
    );
    expect(returned.secret).toBe(key.secret);
  });

  it("redacts the secret for an admin who did not create the key", async () => {
    // First admin creates the key.
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const key = await KeyResource.makeNew(
      {
        name: "other-admin-key",
        workspaceId: workspace.id,
        userId: user.id,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      [globalGroup]
    );

    // A different admin in the same workspace lists the keys.
    await createPrivateApiMockRequest({ role: "admin", workspace });

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`);
    expect(res.status).toBe(200);

    const { keys } = await res.json();
    const returned = keys.find(
      (k: { name: string }) => k.name === "other-admin-key"
    );
    expect(returned.secret).toBe(redactString(key.secret, 4));
    expect(returned.secret).not.toBe(key.secret);
  });
});
