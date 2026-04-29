import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAddSandboxPolicyDomain,
  mockCheckEgressForwarderHealth,
  mockReadNewDenyLogEntries,
  mockEmitAuditLogEvent,
  mockGenerateExecId,
  mockGenerateSandboxExecToken,
  mockGetSandboxImage,
  mockMountConversationFiles,
  mockRecordToolDuration,
  mockRefreshGcsToken,
  mockRevokeExecToken,
  mockSetupEgressForwarder,
  mockStartTelemetry,
  mockWrapCommand,
  mockEnsureActive,
} = vi.hoisted(() => ({
  mockAddSandboxPolicyDomain: vi.fn(),
  mockCheckEgressForwarderHealth: vi.fn(),
  mockReadNewDenyLogEntries: vi.fn(),
  mockEmitAuditLogEvent: vi.fn(),
  mockGenerateExecId: vi.fn(),
  mockGenerateSandboxExecToken: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockMountConversationFiles: vi.fn(),
  mockRecordToolDuration: vi.fn(),
  mockRefreshGcsToken: vi.fn(),
  mockRevokeExecToken: vi.fn(),
  mockSetupEgressForwarder: vi.fn(),
  mockStartTelemetry: vi.fn(),
  mockWrapCommand: vi.fn(),
  mockEnsureActive: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: () => "https://dust.tt",
    getSandboxDevFrontHostName: () => undefined,
  },
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  checkEgressForwarderHealth: mockCheckEgressForwarderHealth,
  readNewDenyLogEntries: mockReadNewDenyLogEntries,
  setupEgressForwarder: mockSetupEgressForwarder,
}));

vi.mock("@app/lib/api/sandbox/egress_policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/egress_policy")>();

  return {
    ...actual,
    addSandboxPolicyDomain: mockAddSandboxPolicyDomain,
  };
});

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: (
    type: string,
    resource: { name?: string; sId: string }
  ) => ({
    id: resource.sId,
    name: resource.name ?? resource.sId,
    type,
  }),
  emitAuditLogEvent: mockEmitAuditLogEvent,
}));

vi.mock("@app/lib/api/sandbox/access_tokens", () => ({
  generateExecId: mockGenerateExecId,
  generateSandboxExecToken: mockGenerateSandboxExecToken,
  revokeExecToken: mockRevokeExecToken,
}));

vi.mock("@app/lib/api/sandbox/gcs/mount", () => ({
  mountConversationFiles: mockMountConversationFiles,
  refreshGcsToken: mockRefreshGcsToken,
}));

vi.mock("@app/lib/api/sandbox/image", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/image")>();

  return {
    ...actual,
    getSandboxImage: mockGetSandboxImage,
  };
});

vi.mock("@app/lib/api/sandbox/image/profile", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/image/profile")>();

  return {
    ...actual,
    wrapCommand: mockWrapCommand,
  };
});

vi.mock("@app/lib/api/sandbox/instrumentation", () => ({
  recordToolDuration: mockRecordToolDuration,
}));

vi.mock("@app/lib/api/sandbox/telemetry", () => ({
  startTelemetry: mockStartTelemetry,
}));

vi.mock("@app/lib/resources/sandbox_resource", () => ({
  SandboxResource: {
    ensureActive: mockEnsureActive,
  },
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  addEgressDomainTool,
  buildDescribeToolsetOutput,
  createSandboxTools,
  runSandboxBashTool,
} from "./index";

describe("createSandboxTools", () => {
  it("omits add_egress_domain by default", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createSandboxTools(auth);

    expect(tools.map((tool) => tool.name)).not.toContain("add_egress_domain");
  });

  it("includes add_egress_domain when agent egress requests are enabled", async () => {
    const { workspace, user } = await createResourceTest({});
    await WorkspaceResource.updateMetadata(workspace.id, {
      sandboxAllowAgentEgressRequests: true,
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const tools = await createSandboxTools(auth);

    expect(tools.map((tool) => tool.name)).toContain("add_egress_domain");
  });
});

describe("buildDescribeToolsetOutput", () => {
  it("mirrors dsbx manifest filtering", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const hiddenResult = await buildDescribeToolsetOutput(
      auth,
      "openai",
      "yaml"
    );
    expect(hiddenResult.isOk()).toBe(true);

    if (hiddenResult.isErr()) {
      throw hiddenResult.error;
    }

    expect(hiddenResult.value[0].text).not.toContain("name: dsbx");

    await FeatureFlagFactory.basic(auth, "sandbox_dsbx_tools");

    const visibleResult = await buildDescribeToolsetOutput(
      auth,
      "openai",
      "yaml"
    );
    expect(visibleResult.isOk()).toBe(true);

    if (visibleResult.isErr()) {
      throw visibleResult.error;
    }

    expect(visibleResult.value[0].text).toContain("name: dsbx");
  });
});

describe("runSandboxBashTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateExecId.mockReturnValue("exec-1");
    mockGenerateSandboxExecToken.mockResolvedValue("sandbox-token");
    mockGetSandboxImage.mockReturnValue(new Ok({}));
    mockMountConversationFiles.mockResolvedValue(new Ok(undefined));
    mockRefreshGcsToken.mockResolvedValue(new Ok(undefined));
    mockReadNewDenyLogEntries.mockResolvedValue(new Ok([]));
    mockRevokeExecToken.mockResolvedValue(undefined);
    mockSetupEgressForwarder.mockResolvedValue(new Ok(undefined));
    mockStartTelemetry.mockResolvedValue(undefined);
    mockWrapCommand.mockImplementation(
      (command: string) => `wrapped:${command}`
    );
  });

  function makeExtra() {
    return {
      auth: {
        getNonNullableWorkspace: () => ({
          name: "Workspace",
          sId: "workspace-id",
        }),
      },
      agentLoopContext: {
        runContext: {
          agentConfiguration: {
            model: { providerId: "openai" },
            sId: "agent-id",
          },
          agentMessage: { sId: "message-id" },
          conversation: { sId: "conversation-id" },
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  it("executes as agent-proxied when the forwarder is healthy", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(
          new Ok({ exitCode: 0, stdout: "hello", stderr: "" })
        ),
    };

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: false,
      })
    );

    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(true));

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).not.toHaveBeenCalled();
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.anything(),
      "wrapped:echo hello",
      expect.objectContaining({
        user: "agent-proxied",
      })
    );
  });

  it("restarts the forwarder when the health check fails", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(
          new Ok({ exitCode: 0, stdout: "hello", stderr: "" })
        ),
    };

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox,
        wokeFromSleep: true,
      })
    );

    mockCheckEgressForwarderHealth.mockResolvedValue(new Ok(false));

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetupEgressForwarder).toHaveBeenCalledTimes(1);
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.anything(),
      "wrapped:echo hello",
      expect.objectContaining({
        user: "agent-proxied",
      })
    );
    expect(mockRecordToolDuration).toHaveBeenCalledWith(
      "bash",
      expect.any(Number),
      { workspaceId: "workspace-id" },
      "success"
    );
  });

  it("returns an MCP error when egress setup fails", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi.fn(),
    };

    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: true,
        sandbox,
        wokeFromSleep: false,
      })
    );

    mockSetupEgressForwarder.mockResolvedValue(
      new Err(new Error("setup failed"))
    );

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("setup failed");
    }
    expect(sandbox.exec).not.toHaveBeenCalled();
  });
});

describe("addEgressDomainTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddSandboxPolicyDomain.mockResolvedValue(
      new Ok({
        addedDomain: "example.org",
        policy: { allowedDomains: ["example.org"] },
      })
    );
  });

  function makeExtra({
    allowAgentEgressRequests = true,
  }: {
    allowAgentEgressRequests?: boolean;
  } = {}) {
    return {
      auth: {
        getNonNullableWorkspace: () => ({
          name: "Workspace",
          sId: "workspace-id",
          metadata: {
            sandboxAllowAgentEgressRequests: allowAgentEgressRequests,
          },
        }),
      },
      agentLoopContext: {
        runContext: {
          conversation: { sId: "conversation-id" },
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  it("refuses to run when agent egress requests are disabled", async () => {
    const result = await addEgressDomainTool(
      {
        domain: "example.org",
        reason: "Retry a blocked request.",
      },
      makeExtra({ allowAgentEgressRequests: false })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Agent-driven egress requests are disabled"
      );
    }
    expect(mockEnsureActive).not.toHaveBeenCalled();
    expect(mockAddSandboxPolicyDomain).not.toHaveBeenCalled();
  });

  it("adds the domain to the active sandbox policy and emits an audit event", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        wokeFromSleep: false,
      })
    );

    const result = await addEgressDomainTool(
      {
        domain: "Example.ORG",
        reason: "Install package dependencies.",
      },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockAddSandboxPolicyDomain).toHaveBeenCalledWith(expect.anything(), {
      domain: "example.org",
      sandboxProviderId: "provider-id",
    });
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith({
      auth: expect.anything(),
      action: "sandbox_egress_policy.sandbox_updated",
      targets: [
        { id: "workspace-id", name: "Workspace", type: "workspace" },
        {
          id: "provider-id",
          name: "Sandbox egress policy sandbox-id",
          type: "sandbox_egress_policy",
        },
      ],
      metadata: {
        added: "true",
        domain: "example.org",
        reason: "Install package dependencies.",
        sandbox_provider_id: "provider-id",
      },
    });
    if (result.isOk()) {
      expect(result.value[0].text).toContain("Allowed: example.org");
    }
  });

  it("reports the domain as already allowed when nothing changed", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        wokeFromSleep: false,
      })
    );
    mockAddSandboxPolicyDomain.mockResolvedValue(
      new Ok({
        addedDomain: null,
        policy: { allowedDomains: ["example.org"] },
      })
    );

    const result = await addEgressDomainTool(
      {
        domain: "example.org",
        reason: "Retry a blocked request.",
      },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].text).toContain("Already allowed: example.org");
    }
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          added: "false",
          domain: "example.org",
        }),
      })
    );
  });

  it("rejects wildcard domains before writing policy", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        wokeFromSleep: false,
      })
    );

    const result = await addEgressDomainTool(
      {
        domain: "*.example.org",
        reason: "Too broad.",
      },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(mockAddSandboxPolicyDomain).not.toHaveBeenCalled();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("returns an error without conversation context", async () => {
    const result = await addEgressDomainTool(
      {
        domain: "example.org",
        reason: "Retry a blocked request.",
      },
      {
        auth: {
          getNonNullableWorkspace: () => ({
            name: "Workspace",
            sId: "workspace-id",
          }),
        },
        agentLoopContext: undefined,
        signal: new AbortController().signal,
      } as never
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnsureActive).not.toHaveBeenCalled();
  });

  it("returns an error when no active sandbox is available", async () => {
    mockEnsureActive.mockResolvedValue(new Err(new Error("No active sandbox")));

    const result = await addEgressDomainTool(
      {
        domain: "example.org",
        reason: "Retry a blocked request.",
      },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(mockAddSandboxPolicyDomain).not.toHaveBeenCalled();
  });

  it("surfaces sandbox policy helper errors", async () => {
    mockEnsureActive.mockResolvedValue(
      new Ok({
        freshlyCreated: false,
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        wokeFromSleep: false,
      })
    );
    mockAddSandboxPolicyDomain.mockResolvedValue(
      new Err(new Error("Sandbox egress policy cannot exceed 100 domains."))
    );

    const result = await addEgressDomainTool(
      {
        domain: "overflow.example.org",
        reason: "Retry a blocked request.",
      },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
