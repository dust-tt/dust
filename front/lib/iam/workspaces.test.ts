import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { Organization } from "@workos-inc/node";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOrCreateWorkOSOrganization } = vi.hoisted(() => ({
  mockGetOrCreateWorkOSOrganization: vi.fn(),
}));

vi.mock("@app/lib/api/workos/organization", () => ({
  getOrCreateWorkOSOrganization: mockGetOrCreateWorkOSOrganization,
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
    mockGetOrCreateWorkOSOrganization.mockImplementation(
      async (
        workspace: { id: number; sId: string; name: string },
        { transaction }: { transaction?: Transaction } = {}
      ) => {
        const organizationId = `org_${workspace.sId}`;
        await WorkspaceResource.updateWorkOSOrganizationId(
          workspace.id,
          organizationId,
          transaction
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
      }),
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(workspace.workOSOrganizationId).toBe(`org_${workspace.sId}`);
  });

  it("throws when WorkOS organization creation fails", async () => {
    mockGetOrCreateWorkOSOrganization.mockResolvedValueOnce(
      new Err(new Error("WorkOS unavailable"))
    );

    // Hard-fail: in production `withTransaction` opens a real transaction that
    // rolls back on throw. Tests reuse the CLS suite transaction, so we only
    // assert the error bubbles (no soft-fail workspace return).
    await expect(
      createWorkspaceInternal({
        name: "Workspace Without Org",
        isBusiness: false,
        planCode: null,
        endDate: null,
      })
    ).rejects.toThrow("WorkOS unavailable");
  });
});
