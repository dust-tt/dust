import {
  createConnectionAndGetSetupUrl,
  finalizeConnection,
} from "@app/lib/api/oauth";
import { OAUTH_FINALIZE_NONCE_METADATA_KEY } from "@app/lib/api/oauth/finalize_binding";
import { GithubOAuthProvider } from "@app/lib/api/oauth/providers/github";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
  finalizeConnection: vi.fn(),
  createConnection: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
        finalizeConnection: mocks.finalizeConnection,
        createConnection: mocks.createConnection,
      };
    }),
  };
});

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: vi.fn(() => ({})),
  emitAuditLogEvent: vi.fn(),
}));

function pendingConnection({
  connectionId = "con_test-secret",
  userId,
  workspaceId,
  finalizeNonce = "test-finalize-nonce-value-32chars!!",
  extraMetadata = {},
}: {
  connectionId?: string;
  userId: string;
  workspaceId: string;
  finalizeNonce?: string;
  extraMetadata?: Record<string, string>;
}): OAuthConnectionType {
  return {
    connection_id: connectionId,
    created: Date.now(),
    provider: "github",
    status: "pending",
    metadata: {
      user_id: userId,
      workspace_id: workspaceId,
      use_case: "connection",
      [OAUTH_FINALIZE_NONCE_METADATA_KEY]: finalizeNonce,
      ...extraMetadata,
    },
    redirect_uri: "https://dust.tt/oauth/github/finalize",
  };
}

describe("finalizeConnection", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.finalizeConnection.mockReset();
  });

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
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects cross-user finalization before exchanging the code", async () => {
    const {
      authenticator: ownerAuth,
      workspace,
      user: owner,
    } = await createResourceTest({ role: "admin" });
    const attacker = await UserFactory.basic();
    await MembershipFactory.associate(workspace, attacker, { role: "user" });
    const attackerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      attacker.sId,
      workspace.sId
    );

    const connection = pendingConnection({
      userId: owner.sId,
      workspaceId: workspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      attackerAuth,
      "github",
      { code: "victim-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce: connection.metadata[OAUTH_FINALIZE_NONCE_METADATA_KEY],
      }
    );

    expect(ownerAuth.user()?.sId).toBe(owner.sId);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace finalization before exchanging the code", async () => {
    const { user, workspace: ownerWorkspace } = await createResourceTest({
      role: "admin",
    });
    const otherWorkspace = await WorkspaceFactory.basic();
    await MembershipFactory.associate(otherWorkspace, user, { role: "admin" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      otherWorkspace.sId
    );

    const connection = pendingConnection({
      userId: user.sId,
      workspaceId: ownerWorkspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      otherAuth,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: otherWorkspace.sId,
        finalizeNonce: connection.metadata[OAUTH_FINALIZE_NONCE_METADATA_KEY],
      }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects finalize-nonce mismatch and missing cookie (replay/state mismatch)", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    const connection = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const missingNonce = await finalizeConnection(
      authenticator,
      "github",
      { code: "auth-code", state: connection.connection_id },
      { sessionWorkspaceId: workspace.sId }
    );
    expect(missingNonce.isErr()).toBe(true);
    if (missingNonce.isErr()) {
      expect(missingNonce.error.code).toBe("connection_ownership_mismatch");
    }

    const wrongNonce = await finalizeConnection(
      authenticator,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce: "different-nonce-value-xxxxxxxxxxxx",
      }
    );
    expect(wrongNonce.isErr()).toBe(true);
    if (wrongNonce.isErr()) {
      expect(wrongNonce.error.code).toBe("connection_ownership_mismatch");
    }

    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("allows finalize when ownership and nonce match, including cross-region null workspace", async () => {
    const { user, workspace } = await createResourceTest({ role: "admin" });
    const finalizeNonce = "matching-finalize-nonce-value-ok!";

    const connection = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
      finalizeNonce,
    });
    const finalized = { ...connection, status: "finalized" as const };

    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    mocks.finalizeConnection.mockResolvedValue(
      new Ok({ connection: finalized })
    );

    // Cross-region: session user is known, local workspace row is missing.
    const auth = new Authenticator({
      user,
      role: "none",
      permissions: GroupPermissions.empty(),
      workspace: null,
      subscription: null,
      authMethod: "session",
    });

    const res = await finalizeConnection(
      auth,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce,
      }
    );

    expect(res.isOk()).toBe(true);
    expect(mocks.finalizeConnection).toHaveBeenCalledOnce();
  });

  it("fails closed when auth is null even if a nonce is presented", async () => {
    const connection = pendingConnection({
      userId: "user_owner",
      workspaceId: "ws_owner",
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      null,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: "ws_owner",
        finalizeNonce: connection.metadata[OAUTH_FINALIZE_NONCE_METADATA_KEY],
      }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });
});

describe("createConnectionAndGetSetupUrl", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    vi.restoreAllMocks();
  });

  it("stamps finalize_nonce and keeps identity over extraConfig overrides", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Bypass provider extraConfig shape checks so we can assert identity wins
    // over a malicious client-supplied user_id / workspace_id / finalize_nonce.
    vi.spyOn(
      GithubOAuthProvider.prototype,
      "isExtraConfigValid"
    ).mockReturnValue(true);
    vi.spyOn(GithubOAuthProvider.prototype, "setupUri").mockReturnValue(
      "https://github.com/apps/dust/installations/new?state=con_created-secret"
    );

    mocks.createConnection.mockImplementation(
      ({ metadata }: { metadata: Record<string, unknown> }) =>
        new Ok({
          connection: {
            connection_id: "con_created-secret",
            created: Date.now(),
            provider: "github",
            status: "pending",
            metadata,
            redirect_uri: "https://dust.tt/oauth/github/finalize",
          },
        })
    );

    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "github",
      "connection",
      {
        user_id: "user_attacker",
        workspace_id: "ws_attacker",
        finalize_nonce: "attacker-nonce",
      }
    );

    expect(res.isOk()).toBe(true);
    if (!res.isOk()) {
      return;
    }

    expect(res.value.connectionId).toBe("con_created-secret");
    expect(res.value.finalizeNonce).toBeTruthy();
    expect(res.value.setupUrl).toContain("con_created-secret");

    const createdMetadata = mocks.createConnection.mock.calls[0][0].metadata;
    expect(createdMetadata.user_id).toBe(user.sId);
    expect(createdMetadata.workspace_id).toBe(workspace.sId);
    expect(createdMetadata[OAUTH_FINALIZE_NONCE_METADATA_KEY]).toBe(
      res.value.finalizeNonce
    );
    expect(createdMetadata[OAUTH_FINALIZE_NONCE_METADATA_KEY]).not.toBe(
      "attacker-nonce"
    );
  });
});
