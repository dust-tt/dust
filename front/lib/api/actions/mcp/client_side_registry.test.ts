import {
  deregisterMCPServer,
  getBaseServerId,
  registerMCPServer,
} from "@app/lib/api/actions/mcp/client_side_registry";
import { Authenticator } from "@app/lib/auth";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("registerMCPServer", () => {
  let auth: Authenticator;
  let workspaceId: string;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    workspaceId = workspace.sId;
  });

  it("allocates a distinct serverId per registration of the same server name", async () => {
    // Two registrations with the same name simulate two browser tabs of the
    // same user: each must get its own serverId so their request channels
    // never overlap.
    const first = await registerMCPServer(auth, {
      serverName: "my server",
      workspaceId,
    });
    const second = await registerMCPServer(auth, {
      serverName: "my server",
      workspaceId,
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isOk() && second.isOk()) {
      expect(first.value.serverId).toMatch(
        /^mcp-client-side:my_server\.[0-9a-f]{16}$/
      );
      expect(second.value.serverId).toMatch(
        /^mcp-client-side:my_server\.[0-9a-f]{16}$/
      );
      expect(first.value.serverId).not.toBe(second.value.serverId);
    }
  });

  it("does not recycle serverIds after deregistration", async () => {
    // A new registration must never inherit the serverId (and thus the request
    // channel and its pending request history) of a previous registration.
    const first = await registerMCPServer(auth, {
      serverName: "my server",
      workspaceId,
    });
    expect(first.isOk()).toBe(true);
    if (!first.isOk()) {
      return;
    }

    await deregisterMCPServer(auth, { serverId: first.value.serverId });

    const second = await registerMCPServer(auth, {
      serverName: "my server",
      workspaceId,
    });
    expect(second.isOk()).toBe(true);
    if (second.isOk()) {
      expect(second.value.serverId).not.toBe(first.value.serverId);
    }
  });
});

describe("getBaseServerId", () => {
  it("strips the random hex suffix", () => {
    expect(getBaseServerId("mcp-client-side:my_server.a1b2c3d4e5f60718")).toBe(
      "mcp-client-side:my_server"
    );
  });

  it("strips legacy numeric suffixes", () => {
    expect(getBaseServerId("mcp-client-side:my_server.1")).toBe(
      "mcp-client-side:my_server"
    );
  });

  it("leaves legacy unsuffixed serverIds unchanged", () => {
    expect(getBaseServerId("mcp-client-side:my_server")).toBe(
      "mcp-client-side:my_server"
    );
  });
});
