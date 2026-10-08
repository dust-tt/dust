import {
  LIVE_TICKET_TTL_SECONDS,
  mintLiveTicket,
  redeemLiveTicket,
} from "@app/lib/api/collab/tickets";
import { DustFileSystem, DustFileSystemError } from "@app/lib/api/file_system";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import { Err } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("live tickets", () => {
  it("grant the user, workspace and file they were minted for, once", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");

    const ticket = await mintLiveTicket(auth, path);
    expect(ticket.isOk()).toBe(true);
    if (!ticket.isOk()) {
      return;
    }

    expect(await redeemLiveTicket(ticket.value)).toEqual({
      workspaceId: workspace.sId,
      userId: user.sId,
      canonicalPath: path,
    });
    expect(await redeemLiveTicket(ticket.value)).toBeNull();
  });

  it("expire", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await mintLiveTicket(auth, path);
    if (!ticket.isOk()) {
      throw new Error("No ticket.");
    }

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (LIVE_TICKET_TTL_SECONDS + 1) * 1000);

    expect(await redeemLiveTicket(ticket.value)).toBeNull();
  });

  it("are not minted without co_edition", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");

    const ticket = await mintLiveTicket(auth, path);

    expect(ticket.isErr() && ticket.error.code).toBe("not_available");
  });

  it("are not minted in a workspace in maintenance", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation",
    });
    const inMaintenance = await Authenticator.fromUserIdAndWorkspaceId(
      auth.getNonNullableUser().sId,
      workspace.sId
    );

    const ticket = await mintLiveTicket(inMaintenance, path);

    expect(ticket.isErr() && ticket.error.code).toBe("workspace_unavailable");
  });

  it("are not minted for a file the live session cannot open", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.txt", "Hi.\n", "text/plain");

    const ticket = await mintLiveTicket(auth, path);

    expect(ticket.isErr() && ticket.error.code).toBe("not_markdown");
  });

  it("are not minted for a file the user can only read", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "checkWriteAccess").mockReturnValue(
      new Err(new DustFileSystemError("internal", "Read-only mount."))
    );

    const ticket = await mintLiveTicket(auth, path);

    expect(ticket.isErr() && ticket.error.code).toBe("read_only");
  });

  it("grant nothing for an unknown ticket", async () => {
    expect(await redeemLiveTicket("not-a-ticket")).toBeNull();
  });
});
