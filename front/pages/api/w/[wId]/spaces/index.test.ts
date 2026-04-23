import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it, vi } from "vitest";

const { mockCreateSpaceAndGroup } = vi.hoisted(() => ({
  mockCreateSpaceAndGroup: vi.fn(),
}));

vi.mock("@app/lib/api/spaces", () => ({
  createSpaceAndGroup: mockCreateSpaceAndGroup,
}));

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: vi.fn(() => ({ type: "mock_target" })),
  emitAuditLogEvent: vi.fn(),
  getAuditLogContext: vi.fn(() => ({})),
}));

import handler from "./index";

describe("POST /api/w/[wId]/spaces", () => {
  it("blocks creating an open project when open projects are disabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await WorkspaceResource.updateMetadata(workspace.id, {
      ...(workspace.metadata ?? {}),
      allowOpenProjects: false,
    });

    req.body = {
      name: "Open project should fail",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateSpaceAndGroup).not.toHaveBeenCalled();
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Open projects are disabled by your workspace admin. Create a private project instead.",
      },
    });
  });

  it("allows creating an open project when open projects are allowed", async () => {
    mockCreateSpaceAndGroup.mockResolvedValue({
      isErr: () => false,
      value: {
        sId: "vlt_mockProject",
        name: "Open project is allowed",
        kind: "project",
        toJSON: () => ({
          sId: "vlt_mockProject",
          kind: "project",
          isRestricted: false,
        }),
      },
    });

    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      name: "Open project is allowed",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateSpaceAndGroup).toHaveBeenCalledTimes(1);
    expect(res._getJSONData().space).toEqual(
      expect.objectContaining({
        kind: "project",
        isRestricted: false,
      })
    );
  });
});
