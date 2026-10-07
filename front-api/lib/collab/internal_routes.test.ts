import config from "@app/lib/api/config";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  INTERNAL_LIVE_SOURCE_READ_PATH,
  INTERNAL_LIVE_SOURCE_WRITE_PATH,
} from "@app/types/collab";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import { createInternalDocumentsApp } from "@front-api/lib/collab/internal_routes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "collab-internal-secret";

function post(path: string, body: unknown, authorization?: string) {
  const app = createInternalDocumentsApp(createCollabHocuspocus());
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization && { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  });
}

describe("createInternalDocumentsApp", () => {
  const read = { workspaceId: "w1", canonicalPath: "user-u1/notes.md" };

  beforeEach(() => {
    vi.spyOn(config, "getCollabServerInternalSecret").mockReturnValue(SECRET);
  });

  it("refuses a request without the secret, or when none is configured", async () => {
    expect((await post(INTERNAL_LIVE_SOURCE_READ_PATH, read)).status).toBe(401);
    expect(
      (await post(INTERNAL_LIVE_SOURCE_READ_PATH, read, "Bearer wrong")).status
    ).toBe(401);

    vi.mocked(config.getCollabServerInternalSecret).mockReturnValue(undefined);
    expect(
      (await post(INTERNAL_LIVE_SOURCE_READ_PATH, read, "Bearer ")).status
    ).toBe(401);
  });

  it("reports a document nobody has open as closed", async () => {
    const response = await post(
      INTERNAL_LIVE_SOURCE_READ_PATH,
      read,
      `Bearer ${SECRET}`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ open: false });
  });

  it("refuses a write for a user the live session would refuse", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const user = authenticator.getNonNullableUser();

    // `co_edition` is off for the workspace.
    const response = await post(
      INTERNAL_LIVE_SOURCE_WRITE_PATH,
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        canonicalPath: `user-${user.sId}/notes.md`,
        base: "",
        source: "# Notes\n",
      },
      `Bearer ${SECRET}`
    );

    expect(response.status).toBe(403);
  });
});
