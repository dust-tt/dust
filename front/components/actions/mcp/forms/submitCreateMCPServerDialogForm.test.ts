import {
  CreateMCPServerDialogSubmitError,
  submitCreateMCPServerDialogForm,
} from "@app/components/actions/mcp/forms/submitCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import type { MCPServerType } from "@app/lib/api/mcp";
import { MCPCreateServerError } from "@app/lib/swr/mcp_servers";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/types/oauth/client/setup"), () => ({
  setupOAuthConnection: vi.fn(),
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
      .mockResolvedValueOnce(
        new Err(new MCPCreateServerError("Name conflict", false, "Candidate"))
      )
      .mockResolvedValueOnce(new Ok({ success: true, server }));

    const submit = (
      submittedValues: CreateMCPServerDialogFormValues,
      remoteMCPServerOAuthConnectionId: string | null
    ) =>
      submitCreateMCPServerDialogForm({
        owner,
        values: submittedValues,
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions", "personal_actions"],
        },
        remoteMCPServerOAuthDiscoveryDone: true,
        remoteMCPServerOAuthConnectionId,
        discoverOAuthMetadata: vi.fn(),
        createWithURL,
        createInternalMCPServer: vi.fn(),
        onBeforeCreateServer: vi.fn(),
        regionInfo: null,
      });

    const firstResult = await submit(values, null);
    expect(firstResult.isErr()).toBe(true);
    if (
      firstResult.isOk() ||
      !(firstResult.error instanceof CreateMCPServerDialogSubmitError)
    ) {
      throw new Error("Expected a create server error");
    }
    expect(firstResult.error.nameConflict).toBe("Candidate");
    expect(firstResult.error.oauthConnectionId).toBe("connection-id");

    const retryResult = await submit(
      { ...values, viewName: "Custom name" },
      firstResult.error.oauthConnectionId
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
