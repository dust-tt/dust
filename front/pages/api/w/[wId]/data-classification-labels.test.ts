import {
  type ResolvedLabelSource,
  resolveLabelSource,
} from "@app/lib/api/data_classification_labels";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import handler from "./data-classification-labels";

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
  method = "GET" as RequestMethod,
  withFeatureFlag = true,
} = {}) {
  const { req, res, workspace, auth, ...rest } =
    await createPrivateApiMockRequest({ role, method });

  req.query.wId = workspace.sId;

  if (withFeatureFlag) {
    await FeatureFlagFactory.basic(auth, "sensitivity_labels");
  }

  return { req, res, workspace, auth, ...rest };
}

// ── Authorization ──────────────────────────────────────────────────────────

describe("Authorization /api/w/[wId]/data-classification-labels", () => {
  it("returns 403 for non-admin users", async () => {
    const { req, res } = await setupTest({ role: "user" });
    req.query.internalMCPServerId = "supported-mcp-server";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("returns 403 when sensitivity_labels feature flag is disabled", async () => {
    const { req, res } = await setupTest({ withFeatureFlag: false });
    req.query.internalMCPServerId = "supported-mcp-server";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.message).toMatch(/sensitivity_labels/);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe("Validation /api/w/[wId]/data-classification-labels", () => {
  it("returns 400 when neither dataSourceId nor internalMCPServerId is provided", async () => {
    const { req, res } = await setupTest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 when both dataSourceId and internalMCPServerId are provided", async () => {
    const { req, res } = await setupTest();
    req.query.dataSourceId = "some-ds";
    req.query.internalMCPServerId = "some-mcp";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for unsupported MCP server", async () => {
    mockResolveLabelSourceError(
      "unsupported_mcp_server",
      "Unsupported MCP server for data classification: unsupported-mcp-server"
    );
    const { req, res } = await setupTest();
    req.query.internalMCPServerId = "unsupported-mcp-server";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toMatch(/Unsupported MCP server/);
  });
});

// ── GET (MCP connection path) ──────────────────────────────────────────────

describe("GET /api/w/[wId]/data-classification-labels (MCP path)", () => {
  it("returns empty labels and allowedLabels when no config exists and no access token", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { req, res } = await setupTest();
    req.query.internalMCPServerId = "supported-mcp-server";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.labels).toEqual([]);
    expect(data.allowedLabels).toEqual([]);
  });

  it("returns labels from Microsoft when access token is available", async () => {
    mockResolveLabelSource(MCP_SOURCE_WITH_TOKEN);
    const { req, res } = await setupTest();
    req.query.internalMCPServerId = "supported-mcp-server";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.labels).toEqual([
      { id: "label-1", name: "Confidential" },
      { id: "label-2", name: "Public" },
    ]);
    expect(data.allowedLabels).toEqual([]);
  });
});

// ── POST (MCP connection path) ─────────────────────────────────────────────

describe("POST /api/w/[wId]/data-classification-labels (MCP path)", () => {
  it("returns 400 when allowedLabels is missing", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { req, res } = await setupTest({ method: "POST" });
    req.body = {
      internalMCPServerId: "supported-mcp-server",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("saves allowed labels for MCP connection", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { req, res } = await setupTest({ method: "POST" });
    req.body = {
      internalMCPServerId: "supported-mcp-server",
      allowedLabels: ["label-1", "label-2"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.config).toBeDefined();
    expect(data.config.sourceType).toBe("mcp_connection");
    expect(data.config.sourceId).toBe("supported-mcp-server");
    expect(data.config.allowedLabels).toEqual(["label-1", "label-2"]);
  });

  it("saves empty allowed labels", async () => {
    mockResolveLabelSource(DEFAULT_MCP_SOURCE);
    const { req, res } = await setupTest({ method: "POST" });
    req.body = {
      internalMCPServerId: "supported-mcp-server",
      allowedLabels: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().config.allowedLabels).toEqual([]);
  });
});

// ── GET (connector path) ──────────────────────────────────────────────────

describe("GET /api/w/[wId]/data-classification-labels (connector path)", () => {
  it("returns 404 for non-existent data source", async () => {
    mockResolveLabelSourceError(
      "data_source_not_found",
      "The data source was not found."
    );
    const { req, res } = await setupTest();
    req.query.dataSourceId = "non-existent-ds";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("data_source_not_found");
  });
});

// ── Method not allowed ─────────────────────────────────────────────────────

describe("Method support /api/w/[wId]/data-classification-labels", () => {
  it("returns 405 for unsupported methods", async () => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      mockResolveLabelSource(DEFAULT_MCP_SOURCE);
      const { req, res } = await setupTest({ method });
      // For non-GET methods, source is read from req.body.
      req.body = {
        internalMCPServerId: "supported-mcp-server",
        allowedLabels: ["label-1"],
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });
});
