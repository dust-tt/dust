import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetInternalMCPServerNameFromSId, mockLookupAutoApprovePredicate } =
  vi.hoisted(() => ({
    mockGetInternalMCPServerNameFromSId: vi.fn(),
    mockLookupAutoApprovePredicate: vi.fn(),
  }));

vi.mock("@app/lib/actions/auto_approve_registry", () => ({
  lookupAutoApprovePredicate: mockLookupAutoApprovePredicate,
}));

vi.mock("@app/lib/actions/mcp_internal_actions/constants", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/actions/mcp_internal_actions/constants")
  >("@app/lib/actions/mcp_internal_actions/constants");

  return {
    ...actual,
    getInternalMCPServerNameFromSId: mockGetInternalMCPServerNameFromSId,
  };
});

import {
  extractArgRequiringApprovalValues,
  getExecutionStatusFromConfig,
} from "@app/lib/actions/tool_status";

const highStakeActionConfiguration: MCPToolConfigurationType = {
  id: 1,
  sId: "tool-config",
  type: "mcp_configuration",
  name: "sandbox:add_egress_domain",
  description: "",
  inputSchema: { type: "object" },
  availability: "auto_hidden_builder",
  icon: "CommandLineIcon",
  dataSources: [],
  tables: null,
  childAgentId: null,
  timeFrame: null,
  jsonSchema: null,
  additionalConfiguration: {},
  mcpServerViewId: "mcp-server-view",
  dustAppConfiguration: null,
  internalMCPServerId: "internal-mcp-server",
  secretName: null,
  dustProject: null,
  permission: "high",
  toolServerId: "internal-server-sid",
  originalName: "add_egress_domain",
  mcpServerName: "sandbox",
  retryPolicy: "no_retry",
};

describe("extractArgRequiringApprovalValues", () => {
  it("keeps existing behavior for primitive and single-element array values", () => {
    const values = extractArgRequiringApprovalValues(
      ["recipient", "retries", "dryRun", "email"],
      {
        recipient: "team@dust.tt",
        retries: 3,
        dryRun: false,
        email: ["adrien@dust.tt"],
      }
    );

    expect(values).toEqual({
      recipient: "team@dust.tt",
      retries: "3",
      dryRun: "false",
      email: "adrien@dust.tt",
    });
  });

  it("serializes multi-element arrays", () => {
    const values = extractArgRequiringApprovalValues(["emails", "ids"], {
      emails: ["first@dust.tt", "second@dust.tt"],
      ids: [2, 1],
    });

    expect(values).toEqual({
      emails: '["first@dust.tt","second@dust.tt"]',
      ids: "[2,1]",
    });
  });

  it("serializes objects with stable key ordering, including nested objects", () => {
    const values = extractArgRequiringApprovalValues(["payload"], {
      payload: {
        z: 1,
        nested: {
          b: "two",
          a: "one",
        },
        a: true,
      },
    });

    expect(values).toEqual({
      payload: '{"a":true,"nested":{"a":"one","b":"two"},"z":1}',
    });
  });

  it("returns identical strings for equivalent objects with different key order", () => {
    const first = extractArgRequiringApprovalValues(["payload"], {
      payload: {
        z: 1,
        nested: {
          c: [3, 2, 1],
          b: "two",
          a: "one",
        },
        a: true,
      },
    });

    const second = extractArgRequiringApprovalValues(["payload"], {
      payload: {
        a: true,
        nested: {
          a: "one",
          c: [3, 2, 1],
          b: "two",
        },
        z: 1,
      },
    });

    expect(first.payload).toEqual(second.payload);
  });
});

describe("getExecutionStatusFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-approves high stake tools when the registered predicate matches", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const predicate = vi.fn().mockResolvedValue(true);
    mockGetInternalMCPServerNameFromSId.mockReturnValue("sandbox");
    mockLookupAutoApprovePredicate.mockReturnValue(predicate);

    const rawInputs = {
      domain: "api.github.com",
      reason: "Fetch release metadata.",
    };
    const result = await getExecutionStatusFromConfig(
      auth,
      highStakeActionConfiguration,
      { skipToolsValidation: false },
      {
        agentId: "agent",
        conversationId: "conversation",
        rawInputs,
        toolInputs: rawInputs,
      }
    );

    expect(result.status).toBe("ready_allowed_implicitly");
    expect(mockLookupAutoApprovePredicate).toHaveBeenCalledWith(
      "sandbox",
      "add_egress_domain"
    );
    expect(predicate).toHaveBeenCalledWith({
      auth: expect.anything(),
      conversationId: "conversation",
      rawInputs,
    });
  });

  it("blocks high stake tools when the predicate does not match", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const predicate = vi.fn().mockResolvedValue(false);
    mockGetInternalMCPServerNameFromSId.mockReturnValue("sandbox");
    mockLookupAutoApprovePredicate.mockReturnValue(predicate);

    const result = await getExecutionStatusFromConfig(
      auth,
      highStakeActionConfiguration,
      { skipToolsValidation: false },
      {
        agentId: "agent",
        conversationId: "conversation",
        toolInputs: {},
      }
    );

    expect(result.status).toBe("blocked_validation_required");
  });
});
