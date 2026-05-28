import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAddSandboxPolicyDomain,
  mockReadNewDenyLogEntries,
  mockEmitAuditLogEvent,
  mockGenerateExecId,
  mockGenerateSandboxExecToken,
  mockGetSandboxImage,
  mockRecordToolDuration,
  mockRevokeExecToken,
  mockEnsureSandboxReady,
  mockLoadEnv,
  mockLoggerError,
  mockLoggerInfo,
  mockLoggerWarn,
  mockFetchActionById,
} = vi.hoisted(() => ({
  mockAddSandboxPolicyDomain: vi.fn(),
  mockReadNewDenyLogEntries: vi.fn(),
  mockEmitAuditLogEvent: vi.fn(),
  mockGenerateExecId: vi.fn(),
  mockGenerateSandboxExecToken: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockRecordToolDuration: vi.fn(),
  mockRevokeExecToken: vi.fn(),
  mockEnsureSandboxReady: vi.fn(),
  mockLoadEnv: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockFetchActionById: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: () => "https://dust.tt",
    getSandboxDevFrontHostName: () => undefined,
  },
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  readNewDenyLogEntries: mockReadNewDenyLogEntries,
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

vi.mock("@app/lib/api/sandbox/image", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/image")>();

  return {
    ...actual,
    getSandboxImage: mockGetSandboxImage,
  };
});

vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {
    fetchById: mockFetchActionById,
  },
}));

vi.mock("@app/lib/api/sandbox/instrumentation", () => ({
  recordToolDuration: mockRecordToolDuration,
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensureSandboxReady: mockEnsureSandboxReady,
}));

vi.mock("@app/lib/resources/workspace_sandbox_env_var_resource", () => ({
  WorkspaceSandboxEnvVarResource: {
    loadEnv: mockLoadEnv,
  },
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
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

  it("includes add_egress_domain when both flag and metadata are set", async () => {
    const { workspace, user } = await createResourceTest({});
    await WorkspaceResource.updateMetadata(workspace.id, {
      sandboxAllowAgentEgressRequests: true,
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "sandbox_workspace_admin");

    const tools = await createSandboxTools(auth);

    expect(tools.map((tool) => tool.name)).toContain("add_egress_domain");
  });

  it("omits add_egress_domain when flag is off, even if metadata is set", async () => {
    const { workspace, user } = await createResourceTest({});
    await WorkspaceResource.updateMetadata(workspace.id, {
      sandboxAllowAgentEgressRequests: true,
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const tools = await createSandboxTools(auth);

    expect(tools.map((tool) => tool.name)).not.toContain("add_egress_domain");
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
    mockLoadEnv.mockResolvedValue(new Ok({}));
    mockReadNewDenyLogEntries.mockResolvedValue(new Ok([]));
    mockRevokeExecToken.mockResolvedValue(undefined);
    // Default: no parent action found on refetch ⇒ not paused, normal path.
    mockFetchActionById.mockResolvedValue(null);
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
          agentMessage: { sId: "message-id", agentMessageId: 1 },
          conversation: { sId: "conversation-id" },
          currentAction: { sId: "sandbox-action-id" },
          stepContext: {
            citationsCount: 0,
            citationsOffset: 0,
            resumeState: null,
            retrievalTopK: 0,
            websearchResultCount: 0,
          },
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

    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await runSandboxBashTool(
      { command: "echo hello", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("echo hello"),
      expect.objectContaining({
        user: "agent-proxied",
      })
    );
  });

  it("redacts eligible workspace env var values from final bash output", async () => {
    const secretValue = "high-entropy-token-123";
    mockLoadEnv.mockResolvedValue(new Ok({ DST_API_TOKEN: secretValue }));
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValue(
        new Ok({
          exitCode: 0,
          stdout: `token=${secretValue}`,
          stderr: "",
        })
      ),
    };

    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await runSandboxBashTool(
      { command: "echo token", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    const first = result.value[0];
    if (first.type !== "text") {
      throw new Error(`expected text item, got ${first.type}`);
    }
    expect(first.text).toContain("«redacted: $DST_API_TOKEN»");
    expect(first.text).not.toContain(secretValue);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-id",
        varNames: ["DST_API_TOKEN"],
      },
      "sandbox bash output contained env var values; redacted"
    );
  });

  it("redacts eligible values from appended network proxy logs", async () => {
    const secretValue = "another-high-entropy-token";
    mockLoadEnv.mockResolvedValue(new Ok({ DST_API_TOKEN: secretValue }));
    mockReadNewDenyLogEntries.mockResolvedValue(
      new Ok([`denied example.com ${secretValue}`])
    );
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "ok", stderr: "" })),
    };

    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await runSandboxBashTool(
      { command: "echo ok", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    const first = result.value[0];
    if (first.type !== "text") {
      throw new Error(`expected text item, got ${first.type}`);
    }
    expect(first.text).toContain(
      "<network_proxy_logs>\ndenied example.com «redacted: $DST_API_TOKEN»\n</network_proxy_logs>"
    );
    expect(first.text).not.toContain(secretValue);
  });

  it("does not redact short or low-entropy values", async () => {
    mockLoadEnv.mockResolvedValue(
      new Ok({
        DST_SHORT_VALUE: "12345678",
        DST_BOOLEAN_VALUE: "true",
        DST_NUMERIC_VALUE: "1234567890123456",
        DST_WORD_VALUE: "abc123def456",
      })
    );
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValue(
        new Ok({
          exitCode: 0,
          stdout:
            "12345678 true 1234567890123456 abc123def456 high-entropy-token",
          stderr: "",
        })
      ),
    };

    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await runSandboxBashTool(
      { command: "echo values", description: "Run command" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    const first = result.value[0];
    if (first.type !== "text") {
      throw new Error(`expected text item, got ${first.type}`);
    }
    expect(first.text).toContain("12345678 true 1234567890123456 abc123def456");
    expect(first.text).not.toContain("«redacted:");
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      "sandbox bash output contained env var values; redacted"
    );
  });

  it("fails closed when env var redaction materialization fails", async () => {
    mockLoadEnv.mockResolvedValue(
      new Err(new Error("bad ciphertext for DST_API_TOKEN"))
    );
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValue(
          new Ok({ exitCode: 0, stdout: "secret", stderr: "" })
        ),
    };

    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await runSandboxBashTool(
      { command: "echo secret", description: "Run command" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Failed to safely return sandbox output."
      );
    }
  });

  it("returns an MCP error when sandbox lifecycle setup fails", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
      exec: vi.fn(),
    };

    mockEnsureSandboxReady.mockResolvedValue(
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

  describe("pause path", () => {
    function execingSandbox() {
      return {
        providerId: "provider-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(
            new Err(new Error("sandbox paused mid-exec (SDK rejection)"))
          ),
      };
    }

    it("returns tool_blocked_awaiting_input carrying the execId when parent is in blocked state after exec", async () => {
      // resumeState is persisted by the generic tool_blocked_awaiting_input
      // exit_events handler off the resource's `state` field — not inline
      // by the bash tool. Here we only assert the bash returns the resource
      // shape that downstream relies on.
      const sandbox = execingSandbox();
      mockEnsureSandboxReady.mockResolvedValue(
        new Ok({ sandbox, freshlyCreated: false })
      );

      mockFetchActionById.mockResolvedValue({
        status: "blocked_child_action_input_required",
      });

      const result = await runSandboxBashTool(
        { command: "echo paused", description: "Run command" },
        makeExtra()
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: {
          type: "tool_blocked_awaiting_input",
          state: { execId: "exec-1" },
        },
      });
    });

    it("returns normal exec result when parent is still running after exec (no pause)", async () => {
      const sandbox = {
        providerId: "provider-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(new Ok({ exitCode: 0, stdout: "ok", stderr: "" })),
      };
      mockEnsureSandboxReady.mockResolvedValue(
        new Ok({ sandbox, freshlyCreated: false })
      );

      mockFetchActionById.mockResolvedValue({
        status: "running",
        updateStepContext: vi.fn(),
      });

      const result = await runSandboxBashTool(
        { command: "echo ok", description: "Run command" },
        makeExtra()
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      expect(result.value[0]).toMatchObject({ type: "text" });
    });

    it("returns normal exec result when refetched parent is null", async () => {
      const sandbox = {
        providerId: "provider-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(new Ok({ exitCode: 0, stdout: "ok", stderr: "" })),
      };
      mockEnsureSandboxReady.mockResolvedValue(
        new Ok({ sandbox, freshlyCreated: false })
      );
      mockFetchActionById.mockResolvedValue(null);

      const result = await runSandboxBashTool(
        { command: "echo ok", description: "Run command" },
        makeExtra()
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      expect(result.value[0]).toMatchObject({ type: "text" });
    });
  });

  describe("resume mode", () => {
    function resumeStepContext(execId: string) {
      return {
        agentLoopContext: {
          runContext: {
            agentConfiguration: {
              model: { providerId: "openai" },
              sId: "agent-id",
            },
            agentMessage: { sId: "message-id", agentMessageId: 1 },
            conversation: { sId: "conversation-id" },
            currentAction: { sId: "sandbox-action-id" },
            stepContext: {
              citationsCount: 0,
              citationsOffset: 0,
              resumeState: { execId },
              retrievalTopK: 0,
              websearchResultCount: 0,
            },
          },
        },
        auth: {
          getNonNullableWorkspace: () => ({
            name: "Workspace",
            sId: "workspace-id",
          }),
        },
        signal: new AbortController().signal,
      } as never;
    }

    it("runs wait-and-collect when resumeState carries a valid execId", async () => {
      const sandbox = {
        providerId: "provider-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(
            new Ok({ exitCode: 0, stdout: "resumed", stderr: "" })
          ),
      };
      mockEnsureSandboxReady.mockResolvedValue(
        new Ok({ sandbox, freshlyCreated: false })
      );

      const result = await runSandboxBashTool(
        { command: "echo new", description: "Run command" },
        resumeStepContext("0123456789abcdef")
      );

      expect(result.isOk()).toBe(true);
      // wait-and-collect uses dust_wac_<execId> as a pid file marker;
      // wrapCommandWithCapture would emit `exec > >(tee` instead.
      const [, command] = (sandbox.exec as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(command).toContain("dust_wac_0123456789abcdef");
      expect(command).not.toContain("exec > >(tee");
      expect(command).not.toContain("echo new");
    });

    it("returns MCPError when sandbox was freshly created during resume (original exec lost)", async () => {
      const sandbox = {
        providerId: "provider-id",
        sId: "sandbox-id",
        exec: vi.fn(),
      };
      mockEnsureSandboxReady.mockResolvedValue(
        new Ok({ sandbox, freshlyCreated: true })
      );

      const result = await runSandboxBashTool(
        { command: "echo new", description: "Run command" },
        resumeStepContext("0123456789abcdef")
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Sandbox was lost");
      }
      expect(sandbox.exec).not.toHaveBeenCalled();
    });
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
    expect(mockEnsureSandboxReady).not.toHaveBeenCalled();
    expect(mockAddSandboxPolicyDomain).not.toHaveBeenCalled();
  });

  it("adds the domain to the active sandbox policy and emits an audit event", async () => {
    const sandbox = {
      providerId: "provider-id",
      sId: "sandbox-id",
    };
    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );

    const result = await addEgressDomainTool(
      {
        domain: "Example.ORG",
        reason: "Install package dependencies.",
      },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockEnsureSandboxReady).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sId: "conversation-id" })
    );
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
    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        freshlyCreated: false,
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
    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        freshlyCreated: false,
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
    expect(mockEnsureSandboxReady).not.toHaveBeenCalled();
  });

  it("returns an error when no active sandbox is available", async () => {
    mockEnsureSandboxReady.mockResolvedValue(
      new Err(new Error("No active sandbox"))
    );

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
    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({
        sandbox: {
          providerId: "provider-id",
          sId: "sandbox-id",
        },
        freshlyCreated: false,
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
