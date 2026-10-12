import { checkLiveAccess } from "@app/lib/api/collab/live_file";
import { ENVELOPE_MAP_NAME } from "@app/lib/api/collab/ydoc";
import config from "@app/lib/api/config";
import { DustFileSystem, DustFileSystemError } from "@app/lib/api/file_system";
import { WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES } from "@app/lib/api/files/file_system_ops";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { LiveAgentFactory } from "@app/tests/utils/LiveAgentFactory";
import { writeUserFile } from "@app/tests/utils/user_files";
import {
  COLLAB_INTERNAL_ROUTES_PREFIX,
  LIVE_SOURCE_READ_PATH,
  LIVE_SOURCE_WRITE_PATH,
  toLiveDocumentName,
} from "@app/types/collab";
import { Err } from "@app/types/shared/result";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import { createInternalDocumentsApp } from "@front-api/lib/collab/internal_routes";
import { createHono } from "@front-api/lib/hono";
import { unhandledErrorHandler } from "@front-api/middlewares/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "collab-internal-secret";

function postRaw(
  path: string,
  body: string,
  authorization?: string,
  hocuspocus = createCollabHocuspocus()
) {
  // Mounted as the collab server mounts it.
  const app = createHono()
    .route(
      COLLAB_INTERNAL_ROUTES_PREFIX,
      createInternalDocumentsApp(hocuspocus)
    )
    .onError(unhandledErrorHandler);
  return app.request(`${COLLAB_INTERNAL_ROUTES_PREFIX}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization && { Authorization: authorization }),
    },
    body,
  });
}

function post(
  path: string,
  body: unknown,
  authorization?: string,
  hocuspocus?: ReturnType<typeof createCollabHocuspocus>
) {
  return postRaw(path, JSON.stringify(body), authorization, hocuspocus);
}

describe("createInternalDocumentsApp", () => {
  const read = { workspaceId: "w1", canonicalPath: "user-u1/notes.md" };

  beforeEach(() => {
    vi.spyOn(config, "getCollabServerInternalSecret").mockReturnValue(SECRET);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a request without the secret, or when none is configured", async () => {
    expect((await post(LIVE_SOURCE_READ_PATH, read)).status).toBe(401);
    expect(
      (await post(LIVE_SOURCE_READ_PATH, read, "Bearer wrong")).status
    ).toBe(401);

    vi.mocked(config.getCollabServerInternalSecret).mockReturnValue(undefined);
    expect((await post(LIVE_SOURCE_READ_PATH, read, "Bearer ")).status).toBe(
      401
    );
  });

  it("answers a malformed body with the standard error envelope", async () => {
    const response = await postRaw(
      LIVE_SOURCE_READ_PATH,
      "{",
      `Bearer ${SECRET}`
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("reports a document nobody has open as closed", async () => {
    const response = await post(
      LIVE_SOURCE_READ_PATH,
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
      LIVE_SOURCE_WRITE_PATH,
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
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
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
    const name = toLiveDocumentName(workspace.sId, canonicalPath);
    await hocuspocus.openDirectConnection(name, file.value);
    return {
      hocuspocus,
      name,
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
        LIVE_SOURCE_READ_PATH,
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

  it("shows an agent reading only once its user may open the document", async () => {
    const { hocuspocus, name, request } = await openNotes();
    const { authenticator: outsider } = await createResourceTest({});
    const document = hocuspocus.documents.get(name);
    if (!document) {
      throw new Error("The document is not open.");
    }
    const broadcast = vi.spyOn(document, "broadcastStateless");
    const agent = LiveAgentFactory.build();
    const readAs = (userId: string) =>
      post(
        LIVE_SOURCE_READ_PATH,
        { ...request, userId, agent },
        `Bearer ${SECRET}`,
        hocuspocus
      );

    expect((await readAs(outsider.getNonNullableUser().sId)).status).toBe(403);
    expect(broadcast).not.toHaveBeenCalled();

    expect((await readAs(request.userId)).status).toBe(200);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(broadcast.mock.calls[0][0]))).toEqual({
      type: "agent_activity",
      agent,
      activity: "reading",
    });
  });

  it("serves an open document's source to a user who can only read it, never their write", async () => {
    const { hocuspocus, request } = await openNotes();
    vi.spyOn(DustFileSystem.prototype, "checkWriteAccess").mockReturnValue(
      new Err(new DustFileSystemError("internal", "Read-only mount."))
    );

    const read = await post(
      LIVE_SOURCE_READ_PATH,
      request,
      `Bearer ${SECRET}`,
      hocuspocus
    );
    const written = await post(
      LIVE_SOURCE_WRITE_PATH,
      { ...request, base: "# Notes\n", source: "# Edited\n" },
      `Bearer ${SECRET}`,
      hocuspocus
    );

    expect(await read.json()).toEqual({ open: true, source: "# Notes\n" });
    expect(written.status).toBe(403);
    expect(await written.json()).toMatchObject({
      error: { type: "file_read_only" },
    });
  });

  it("refuses a read of an open document it cannot read before telling why", async () => {
    const { hocuspocus, name, request } = await openNotes();
    hocuspocus.documents.get(name)?.getMap(ENVELOPE_MAP_NAME).clear();
    const readAs = (userId?: string) =>
      post(
        LIVE_SOURCE_READ_PATH,
        { ...request, userId },
        `Bearer ${SECRET}`,
        hocuspocus
      );

    expect((await readAs(undefined)).status).toBe(403);
    expect((await readAs(request.userId)).status).toBe(500);
  });

  it("answers a refused access with the error type naming why", async () => {
    const { hocuspocus, request } = await openNotes();

    const response = await post(
      LIVE_SOURCE_WRITE_PATH,
      {
        ...request,
        canonicalPath: `${request.canonicalPath}/`,
        base: "",
        source: "# Notes\n",
      },
      `Bearer ${SECRET}`,
      hocuspocus
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("refuses a source too large for a checkpoint to write", async () => {
    const { hocuspocus, request } = await openNotes();

    const response = await post(
      LIVE_SOURCE_WRITE_PATH,
      {
        ...request,
        base: "# Notes\n",
        source: "a".repeat(WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES + 1),
      },
      `Bearer ${SECRET}`,
      hocuspocus
    );

    expect(await response.json()).toMatchObject({ result: "refused" });
    const after = await post(
      LIVE_SOURCE_READ_PATH,
      request,
      `Bearer ${SECRET}`,
      hocuspocus
    );
    expect(await after.json()).toEqual({ open: true, source: "# Notes\n" });
  });
});
