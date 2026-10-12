import {
  checkLiveAccess,
  loadLiveDocument,
} from "@app/lib/api/collab/live_file";
import { dfmToYDoc } from "@app/lib/api/collab/ydoc";
import { DustFileSystemError } from "@app/lib/api/file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import { toLiveDocumentName } from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import { recheckAllConnections } from "@front-api/lib/collab/recheck";
import { Connection } from "@hocuspocus/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/collab/live_file", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/collab/live_file")>();
  return { ...actual, loadLiveDocument: vi.fn() };
});

/** What `loadLiveDocument` returns for the file the connection opens. */
async function loadSource() {
  const source = "# Notes\n";
  const live = dfmToYDoc(source);
  if (live.isErr()) {
    throw new Error(live.error);
  }
  return new Ok({
    live: live.value,
    checkpoint: { revision: "1", content: source },
  });
}

describe("recheckAllConnections", () => {
  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(loadSource);
  });

  /** A WebSocket connection to the user's own file, open as after a successful connect. */
  async function openConnection(hocuspocus = createCollabHocuspocus()) {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const file = await checkLiveAccess(auth, path);
    if (file.isErr()) {
      throw new Error(file.error.message);
    }
    const request = new Request("http://localhost/api/collab");
    const document = await hocuspocus.createDocument(
      toLiveDocumentName(workspace.sId, path),
      request,
      "socket",
      { readOnly: false, isAuthenticated: true },
      file.value
    );
    const socket = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    const connection = new Connection(
      socket,
      request,
      document,
      "socket",
      file.value
    );
    return { hocuspocus, document, connection, workspace, user };
  }

  it("keeps a connection whose user still has access", async () => {
    const { hocuspocus, document } = await openConnection();

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(1);
  });

  it("does not read the file from storage", async () => {
    const { hocuspocus } = await openConnection();
    const stat = vi.spyOn(DustFileSystem.prototype, "stat");

    await recheckAllConnections(hocuspocus);

    expect(stat).not.toHaveBeenCalled();
    stat.mockRestore();
  });

  it("closes a connection once co_edition is turned off", async () => {
    const { hocuspocus, document, workspace } = await openConnection();
    await FeatureFlagResource.disable(workspace, "co_edition");

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
  });

  it("closes a connection once its user left the workspace", async () => {
    const { hocuspocus, document, workspace, user } = await openConnection();
    const revoked = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revoked.isErr()) {
      throw revoked.error;
    }

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
  });

  it("closes a connection it fails to check, and still checks the others", async () => {
    const hocuspocus = createCollabHocuspocus();
    const failing = await openConnection(hocuspocus);
    const kept = await openConnection(hocuspocus);
    const revoked = await openConnection(hocuspocus);
    await FeatureFlagResource.disable(revoked.workspace, "co_edition");
    const build = Authenticator.fromUserIdAndWorkspaceId.bind(Authenticator);
    const spy = vi
      .spyOn(Authenticator, "fromUserIdAndWorkspaceId")
      .mockImplementation(async (userId, workspaceId) => {
        if (userId === failing.user.sId) {
          throw new Error("Database unavailable.");
        }
        return build(userId, workspaceId);
      });

    await recheckAllConnections(hocuspocus);

    expect(failing.document.getConnectionsCount()).toBe(0);
    expect(kept.document.getConnectionsCount()).toBe(1);
    expect(revoked.document.getConnectionsCount()).toBe(0);
    spy.mockRestore();
  });

  it("closes a connection once its user can only read the file", async () => {
    const { hocuspocus, document } = await openConnection();
    const readOnly = vi
      .spyOn(DustFileSystem.prototype, "checkWriteAccess")
      .mockReturnValue(
        new Err(new DustFileSystemError("internal", "Read-only mount."))
      );

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
    readOnly.mockRestore();
  });
});
