import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { Organization } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetOrCreateWorkOSOrganization,
  mockLaunchImmediateWorkspaceScrubWorkflow,
} = vi.hoisted(() => ({
  mockGetOrCreateWorkOSOrganization: vi.fn(),
  mockLaunchImmediateWorkspaceScrubWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/workos/organization", () => ({
  getOrCreateWorkOSOrganization: mockGetOrCreateWorkOSOrganization,
}));

vi.mock("@app/temporal/scrub_workspace/client", () => ({
  launchImmediateWorkspaceScrubWorkflow:
    mockLaunchImmediateWorkspaceScrubWorkflow,
}));

vi.mock("@app/lib/api/permissions/governance_seeding", () => ({
  seedWorkspaceCapabilities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  "@app/lib/resources/mcp_server_view_resource",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@app/lib/resources/mcp_server_view_resource")
      >();
    return {
      ...mod,
      MCPServerViewResource: {
        ...mod.MCPServerViewResource,
        ensureAllAutoToolsAreCreated: vi.fn().mockResolvedValue(undefined),
      },
    };
  }
);

function mockOrganization(
  partial: Pick<Organization, "id" | "name" | "externalId">
): Organization {
  return {
    object: "organization",
    allowProfilesOutsideOrganization: false,
    domains: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    metadata: {},
    ...partial,
  };
}

describe("createWorkspaceInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLaunchImmediateWorkspaceScrubWorkflow.mockResolvedValue(
      new Ok("scrub-workflow-id")
    );
    mockGetOrCreateWorkOSOrganization.mockImplementation(
      async (workspace: { id: number; sId: string; name: string }) => {
        const organizationId = `org_${workspace.sId}`;
        await WorkspaceResource.updateWorkOSOrganizationId(
          workspace.id,
          organizationId
        );
        return new Ok(
          mockOrganization({
            id: organizationId,
            name: workspace.name,
            externalId: workspace.sId,
          })
        );
      }
    );
  });

  it("creates a WorkOS organization for every new workspace", async () => {
    const workspace = await createWorkspaceInternal({
      name: "WorkOS Org Workspace",
      isBusiness: false,
      planCode: null,
      endDate: null,
    });

    expect(mockGetOrCreateWorkOSOrganization).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateWorkOSOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        sId: workspace.sId,
        name: "WorkOS Org Workspace",
      })
    );
    expect(workspace.workOSOrganizationId).toBe(`org_${workspace.sId}`);
    expect(mockLaunchImmediateWorkspaceScrubWorkflow).not.toHaveBeenCalled();
  });

  it("scrubs and throws when WorkOS organization creation fails", async () => {
    mockGetOrCreateWorkOSOrganization.mockResolvedValueOnce(
      new Err(new Error("WorkOS unavailable"))
    );

    await expect(
      createWorkspaceInternal({
        name: "Workspace Without Org",
        isBusiness: false,
        planCode: null,
        endDate: null,
      })
    ).rejects.toThrow("WorkOS unavailable");

    const leftover = await WorkspaceResource.fetchByName(
      "Workspace Without Org"
    );
    expect(leftover).not.toBeNull();
    expect(mockLaunchImmediateWorkspaceScrubWorkflow).toHaveBeenCalledWith({
      workspaceId: leftover?.sId,
    });
  });
});
