import { ExternalViewerSessionResource } from "@app/lib/resources/external_viewer_session_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { addSeconds } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("ExternalViewerSessionResource", () => {
  it("scopes sessions to their workspace and rejects expired sessions", async () => {
    const { workspace } = await createResourceTest({});
    const other = await createResourceTest({});
    const session = await ExternalViewerSessionResource.create(workspace, {
      email: "alice@example.com",
    });
    const fetched = await ExternalViewerSessionResource.fetchByToken(
      workspace,
      session.sessionToken
    );
    expect(fetched).toBeInstanceOf(ExternalViewerSessionResource);
    expect(fetched?.email).toBe("alice@example.com");
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        other.workspace,
        session.sessionToken
      )
    ).toBeNull();
    vi.setSystemTime(addSeconds(session.expiresAt, 1));
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        workspace,
        session.sessionToken
      )
    ).toBeNull();
  });

  it("deletes a session or all sessions for one workspace without affecting another", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({});
    const other = await createResourceTest({});
    const first = await ExternalViewerSessionResource.create(workspace, {
      email: "alice@example.com",
    });
    const second = await ExternalViewerSessionResource.create(workspace, {
      email: "bob@example.com",
    });
    const third = await ExternalViewerSessionResource.create(other.workspace, {
      email: "alice@example.com",
    });
    expect((await first.delete(other.authenticator)).isOk()).toBe(true);
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        workspace,
        first.sessionToken
      )
    ).not.toBeNull();
    expect((await first.delete(auth)).isOk()).toBe(true);
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        workspace,
        first.sessionToken
      )
    ).toBeNull();
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        workspace,
        second.sessionToken
      )
    ).not.toBeNull();
    await ExternalViewerSessionResource.deleteAllForWorkspace(auth);
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        workspace,
        second.sessionToken
      )
    ).toBeNull();
    expect(
      await ExternalViewerSessionResource.fetchByToken(
        other.workspace,
        third.sessionToken
      )
    ).not.toBeNull();
  });
});
