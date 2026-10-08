import { checkLiveAccess } from "@app/lib/api/collab/live_file";
import config from "@app/lib/api/config";
import { WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES } from "@app/lib/api/files/file_system_ops";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import {
  INTERNAL_LIVE_SOURCE_READ_PATH,
  INTERNAL_LIVE_SOURCE_WRITE_PATH,
  toLiveDocumentName,
} from "@app/types/collab";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import { createInternalDocumentsApp } from "@front-api/lib/collab/internal_routes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "collab-internal-secret";

function post(
  path: string,
  body: unknown,
  authorization?: string,
  hocuspocus = createCollabHocuspocus()
) {
  const app = createInternalDocumentsApp(hocuspocus);
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

  /** A user who can open `notes.md` live, and that file's document opened in a session. */
  async function openNotes() {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const canonicalPath = await writeUserFile(auth, "notes.md", "# Notes\n");
    const file = await checkLiveAccess(auth, canonicalPath);
    if (file.isErr()) {
      throw new Error(file.error.message);
    }
    const hocuspocus = createCollabHocuspocus();
    await hocuspocus.openDirectConnection(
      toLiveDocumentName(workspace.sId, canonicalPath),
      file.value
    );
    return {
      hocuspocus,
      request: {
        workspaceId: workspace.sId,
        userId: auth.getNonNullableUser().sId,
        canonicalPath,
      },
    };
  }

  it("serves an open document's source only to a user who can open it", async () => {
    const { hocuspocus, request } = await openNotes();
    const { authenticator: outsider } = await createResourceTest({});
    const readAs = (userId?: string) =>
      post(
        INTERNAL_LIVE_SOURCE_READ_PATH,
        { ...request, userId },
        `Bearer ${SECRET}`,
        hocuspocus
      );

    const allowed = await readAs(request.userId);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ open: true, source: "# Notes\n" });
    expect((await readAs(undefined)).status).toBe(403);
    expect((await readAs(outsider.getNonNullableUser().sId)).status).toBe(403);
  });

  it("refuses a source too large for a checkpoint to write", async () => {
    const { hocuspocus, request } = await openNotes();

    const response = await post(
      INTERNAL_LIVE_SOURCE_WRITE_PATH,
      {
        ...request,
        base: "# Notes\n",
        source: "a".repeat(WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES + 1),
      },
      `Bearer ${SECRET}`,
      hocuspocus
    );

    expect(await response.json()).toMatchObject({ result: "refused" });
    const read = await post(
      INTERNAL_LIVE_SOURCE_READ_PATH,
      request,
      `Bearer ${SECRET}`,
      hocuspocus
    );
    expect(await read.json()).toEqual({ open: true, source: "# Notes\n" });
  });
});
