import { checkCollabAccess } from "@app/lib/api/collab/access";
import { mintCollabTicket } from "@app/lib/api/collab/tickets";
import { DustFileSystemError } from "@app/lib/api/file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import { toLiveDocumentName } from "@app/types/collab";
import { Err } from "@app/types/shared/result";
import {
  authenticateConnection,
  recheckAllConnections,
} from "@front-api/lib/collab/connection_access";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import { Connection } from "@hocuspocus/server";
import { describe, expect, it, vi } from "vitest";

async function ticketFor(auth: Authenticator, path: string) {
  const ticket = await mintCollabTicket(auth, path);
  if (ticket.isErr()) {
    throw new Error(ticket.error.message);
  }
  return ticket.value;
}

describe("authenticateConnection", () => {
  it("opens the ticket's file for its user, once", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const name = { workspaceId: workspace.sId, canonicalPath: path };
    const ticket = await ticketFor(auth, path);

    const first = await authenticateConnection(name, ticket);
    expect(first.isOk() && first.value.canonicalPath).toBe(path);
    expect(first.isOk() && first.value.canWrite).toBe(true);

    const second = await authenticateConnection(name, ticket);
    expect(second.isErr() && second.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a ticket minted for another file", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const notes = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, notes);
    const other = notes.replace("notes.md", "other.md");

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: other },
      ticket
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a ticket used for another workspace", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);

    const result = await authenticateConnection(
      { workspaceId: "w_other", canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a user who left the workspace after the ticket was minted", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    const revoked = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revoked.isErr()) {
      throw revoked.error;
    }

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "Not a member of this workspace."
    );
  });

  it("refuses a ticket once co_edition is turned off", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    await FeatureFlagResource.disable(workspace, "co_edition");

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "Live editing is not available here."
    );
  });

  it("refuses a ticket once the workspace is in maintenance", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation",
    });

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "This workspace is not available (maintenance)."
    );
  });

  it("refuses a token that is not a ticket", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");

    // What the browser sent before tickets: the user's own id.
    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      user.sId
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });
});

describe("recheckAllConnections", () => {
  /** A WebSocket connection to the user's own file, open as after a successful connect. */
  async function openConnection(hocuspocus = createCollabHocuspocus()) {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const file = await checkCollabAccess(auth, path);
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
