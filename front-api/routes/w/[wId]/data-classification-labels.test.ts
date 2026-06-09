import {
  type ResolvedLabelSource,
  resolveLabelSource,
} from "@app/lib/api/data_classification_labels";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// Mock external dependencies that hit third-party APIs.
vi.mock(import("@app/lib/api/data_classification_labels"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    resolveLabelSource: vi.fn(),
    getMicrosoftSensitivityLabels: vi.fn().mockResolvedValue([
      { id: "label-1", name: "Confidential" },
      { id: "label-2", name: "Public" },
    ]),
  };
});

function mockResolveLabelSource(result: ResolvedLabelSource) {
  vi.mocked(resolveLabelSource).mockResolvedValue(new Ok(result));
}

function mockResolveLabelSourceError(
  type:
    | "data_source_not_found"
    | "not_microsoft_connector"
    | "unsupported_mcp_server",
  message: string
) {
  vi.mocked(resolveLabelSource).mockResolvedValue(new Err({ type, message }));
}

const DEFAULT_MCP_SOURCE: ResolvedLabelSource = {
  sourceType: "mcp_connection",
  sourceId: "supported-mcp-server",
  connectorId: null,
  accessToken: null,
};

const MCP_SOURCE_WITH_TOKEN: ResolvedLabelSource = {
  ...DEFAULT_MCP_SOURCE,
  accessToken: "fake-access-token",
};

async function setupTest({
  role = "admin" as MembershipRoleType,
  withFeatureFlag = true,
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (withFeatureFlag) {
    await FeatureFlagFactory.basic(auth, "sensitivity_labels");
  }

  return { workspace, auth, ...rest };
}

function getLabels(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/data-classification-labels${qs ? `?${qs}` : ""}`
  );
}

function postLabels(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/data-classification-labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Authorization ──────────────────────────────────────────────────────────

describe("Authorization /api/w/:wId/data-classification-labels", () => {
  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
    });

    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("returns 403 when sensitivity_labels feature flag is disabled", async () => {
    const { workspace } = await setupTest({ withFeatureFlag: false });

    const response = await getLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
    });

    expect(response.status).toBe(403);
    const data = (await response.json()) as {
      error: { message: string };
    };
    expect(data.error.message).toMatch(/sensitivity_labels/);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe("Validation /api/w/:wId/data-classification-labels", () => {
  it("returns 400 when neither dataSourceId nor internalMCPServerId is provided", async () => {
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when both dataSourceId and internalMCPServerId are provided", async () => {
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId, {
      dataSourceId: "some-ds",
      internalMCPServerId: "some-mcp",
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 400 for unsupported MCP server", async () => {
    mockResolveLabelSourceError(
      "unsupported_mcp_server",
      "Unsupported MCP server for data classification: unsupported-mcp-server"
    );
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId, {
      internalMCPServerId: "unsupported-mcp-server",
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
      error: { message: string };
    };
    expect(data.error.message).toMatch(/Unsupported MCP server/);
  });
});

// ── GET (MCP connection path) ──────────────────────────────────────────────

describe("GET /api/w/:wId/data-classification-labels (MCP path)", () => {
  it("returns empty labels and allowedLabels when no config exists and no access token", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      labels: unknown[];
      allowedLabels: unknown[];
    };
    expect(data.labels).toEqual([]);
    expect(data.allowedLabels).toEqual([]);
  });

  it("returns labels from Microsoft when access token is available", async () => {
    mockResolveLabelSource(MCP_SOURCE_WITH_TOKEN);
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      labels: { id: string; name: string }[];
      allowedLabels: unknown[];
    };
    expect(data.labels).toEqual([
      { id: "label-1", name: "Confidential" },
      { id: "label-2", name: "Public" },
    ]);
    expect(data.allowedLabels).toEqual([]);
  });
});

// ── POST (MCP connection path) ─────────────────────────────────────────────

describe("POST /api/w/:wId/data-classification-labels (MCP path)", () => {
  it("returns 400 when allowedLabels is missing", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { workspace } = await setupTest();

    const response = await postLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("saves allowed labels for MCP connection", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { workspace } = await setupTest();

    const response = await postLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
      allowedLabels: ["label-1", "label-2"],
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      config: {
        sourceType: string;
        sourceId: string;
        allowedLabels: string[];
      };
    };
    expect(data.config).toBeDefined();
    expect(data.config.sourceType).toBe("mcp_connection");
    expect(data.config.sourceId).toBe("supported-mcp-server");
    expect(data.config.allowedLabels).toEqual(["label-1", "label-2"]);
  });

  it("saves empty allowed labels", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { workspace } = await setupTest();

    const response = await postLabels(workspace.sId, {
      internalMCPServerId: "supported-mcp-server",
      allowedLabels: [],
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      config: { allowedLabels: string[] };
    };
    expect(data.config.allowedLabels).toEqual([]);
  });
});

// ── GET (connector path) ──────────────────────────────────────────────────

describe("GET /api/w/:wId/data-classification-labels (connector path)", () => {
  it("returns 404 for non-existent data source", async () => {
    mockResolveLabelSourceError(
      "data_source_not_found",
      "The data source was not found."
    );
    const { workspace } = await setupTest();

    const response = await getLabels(workspace.sId, {
      dataSourceId: "non-existent-ds",
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("data_source_not_found");
  });
});

// ── Method not allowed ─────────────────────────────────────────────────────

describe("Method support /api/w/:wId/data-classification-labels", () => {
  it("returns 404 for unsupported methods", async () => {
    const { workspace } = await setupTest();

    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/data-classification-labels`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            internalMCPServerId: "supported-mcp-server",
            allowedLabels: ["label-1"],
          }),
        }
      );

      // Hono returns 404 for unregistered methods (no route matched).
      expect(response.status).toBe(404);
    }
  });
});
