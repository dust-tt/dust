import { submitCreateMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { getMCPServerViewNameError } from "@app/components/actions/mcp/forms/utils";
import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import type { MCPServerType } from "@app/lib/api/mcp";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/types/oauth/client/setup"), () => ({
  setupOAuthConnection: vi.fn(),
}));

vi.mock(import("@app/lib/actions/mcp_helper"), async (importOriginal) => ({
  ...(await importOriginal()),
  requiresBearerTokenConfiguration: () => false,
}));

const owner = {
  id: 0,
  sId: "wId",
  name: "Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  metadata: null,
  metronomeCustomerId: null,
  sharingPolicy: "all_scopes",
  regionalModelsOnly: false,
} satisfies WorkspaceType;

const server = {
  name: "Candidate",
  version: DEFAULT_MCP_ACTION_VERSION,
  description: "",
  sId: "remote-id",
  icon: DEFAULT_MCP_SERVER_ICON,
  authorization: null,
  tools: [],
  availability: "manual",
  allowMultipleInstances: true,
  documentationUrl: null,
} satisfies MCPServerType;

const values = {
  useCase: "platform_actions",
  authCredentials: null,
  remoteServerUrl: "https://example.com/mcp",
  authMethod: "oauth-dynamic",
  useCustomHeaders: false,
  customHeaders: [],
  viewName: "",
} satisfies CreateMCPServerDialogFormValues;

describe("submitCreateMCPServerDialogForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits an empty view name when creating an internal server", async () => {
    const createInternalMCPServer = vi.fn().mockResolvedValue(
      new Ok({
        success: true,
        server,
      })
    );

    const result = await submitCreateMCPServerDialogForm({
      owner,
      internalMCPServer: server,
      values: { ...values, remoteServerUrl: "", viewName: "" },
      authorization: null,
      remoteMCPServerOAuthDiscoveryDone: false,
      oauthConnectionId: null,
      discoverOAuthMetadata: vi.fn(),
      createWithURL: vi.fn(),
      createInternalMCPServer,
      onBeforeCreateServer: vi.fn(),
      cellInfo: null,
    });

    expect(result.isOk()).toBe(true);
    expect(createInternalMCPServer).toHaveBeenCalledWith(
      expect.not.objectContaining({ viewName: expect.anything() })
    );
  });

  it("requires a custom name for a second internal server instance", () => {
    expect(
      getMCPServerViewNameError({
        viewName: "",
        needsCustomName: true,
        nameConflict: null,
        existingViewNames: ["Candidate"],
      })
    ).toBe("Name is required.");
  });

  it("uses a custom view name when creating a second internal server instance", async () => {
    const createInternalMCPServer = vi.fn().mockResolvedValue(
      new Ok({
        success: true,
        server,
      })
    );

    const result = await submitCreateMCPServerDialogForm({
      owner,
      internalMCPServer: server,
      values: {
        ...values,
        remoteServerUrl: "",
        viewName: "  Candidate 2  ",
      },
      authorization: null,
      remoteMCPServerOAuthDiscoveryDone: false,
      oauthConnectionId: null,
      discoverOAuthMetadata: vi.fn(),
      createWithURL: vi.fn(),
      createInternalMCPServer,
      onBeforeCreateServer: vi.fn(),
      cellInfo: null,
    });

    expect(result.isOk()).toBe(true);
    expect(createInternalMCPServer).toHaveBeenCalledWith(
      expect.objectContaining({ viewName: "Candidate 2" })
    );
  });

  it("reuses the OAuth connection when retrying a view name conflict", async () => {
    vi.mocked(setupOAuthConnection).mockResolvedValue(
      new Ok({
        connection_id: "connection-id",
        created: 0,
        metadata: {},
        provider: "mcp",
        status: "finalized",
      })
    );

    const createWithURL = vi
      .fn()
      .mockResolvedValueOnce(new Err({ nameConflict: "Candidate" }))
      .mockResolvedValueOnce(new Ok({ success: true, server }));

    const submit = (
      submittedValues: CreateMCPServerDialogFormValues,
      oauthConnectionId: string | null
    ) =>
      submitCreateMCPServerDialogForm({
        owner,
        values: submittedValues,
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions", "personal_actions"],
        },
        remoteMCPServerOAuthDiscoveryDone: true,
        oauthConnectionId,
        discoverOAuthMetadata: vi.fn(),
        createWithURL,
        createInternalMCPServer: vi.fn(),
        onBeforeCreateServer: vi.fn(),
        cellInfo: null,
      });

    const firstResult = await submit(values, null);
    expect(firstResult.isOk()).toBe(true);
    if (firstResult.isErr() || firstResult.value.type !== "name_conflict") {
      throw new Error("Expected a name conflict");
    }
    expect(firstResult.value.name).toBe("Candidate");
    expect(firstResult.value.oauthConnectionId).toBe("connection-id");

    const retryResult = await submit(
      { ...values, viewName: "Custom name" },
      firstResult.value.oauthConnectionId
    );

    expect(retryResult.isOk()).toBe(true);
    expect(setupOAuthConnection).toHaveBeenCalledTimes(1);
    expect(createWithURL).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        viewName: "Custom name",
        oauthConnection: {
          connectionId: "connection-id",
          useCase: "platform_actions",
        },
      })
    );
  });
});
