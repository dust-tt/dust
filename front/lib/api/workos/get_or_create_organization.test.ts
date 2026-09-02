import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { Organization } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetOrganizationByExternalId,
  mockCreateOrganization,
  mockListOrganizationMemberships,
  mockCreateOrganizationMembership,
  mockUpdateOrganizationMembership,
} = vi.hoisted(() => ({
  mockGetOrganizationByExternalId: vi.fn(),
  mockCreateOrganization: vi.fn(),
  mockListOrganizationMemberships: vi.fn(),
  mockCreateOrganizationMembership: vi.fn(),
  mockUpdateOrganizationMembership: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    organizations: {
      getOrganizationByExternalId: mockGetOrganizationByExternalId,
      createOrganization: mockCreateOrganization,
    },
    userManagement: {
      listOrganizationMemberships: mockListOrganizationMemberships,
      createOrganizationMembership: mockCreateOrganizationMembership,
      updateOrganizationMembership: mockUpdateOrganizationMembership,
    },
  }),
}));

vi.mock("@app/lib/api/cells/config", () => ({
  config: {
    getCurrentCell: () => ({ name: "local", region: "local" }),
  },
}));

class WorkOSNotFoundError extends Error {
  status = 404;
  code = "entity_not_found";

  constructor() {
    super("not found");
  }
}

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

describe("getOrCreateWorkOSOrganization membership sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListOrganizationMemberships.mockResolvedValue({ data: [] });
    mockCreateOrganizationMembership.mockResolvedValue({ id: "om_1" });
    mockUpdateOrganizationMembership.mockResolvedValue({ id: "om_1" });
  });

  it("syncs active members when creating a new WorkOS organization", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await user.setWorkOSUserId("user_workos_1");
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    // Ensure factory workspace has no WorkOS org id.
    await WorkspaceResource.updateWorkOSOrganizationId(workspace.id, null);
    const lightWorkspace = {
      ...renderLightWorkspaceType({ workspace }),
      workOSOrganizationId: null,
    };

    mockGetOrganizationByExternalId.mockRejectedValue(
      new WorkOSNotFoundError()
    );
    mockCreateOrganization.mockResolvedValue(
      mockOrganization({
        id: "org_new",
        name: workspace.name,
        externalId: workspace.sId,
      })
    );

    const result = await getOrCreateWorkOSOrganization(lightWorkspace);

    expect(result.isOk()).toBe(true);
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1);
    expect(mockCreateOrganizationMembership).toHaveBeenCalledWith({
      userId: "user_workos_1",
      organizationId: "org_new",
      roleSlug: "admin",
    });

    const refreshed = await WorkspaceResource.fetchByModelId(workspace.id);
    expect(refreshed?.workOSOrganizationId).toBe("org_new");
  });

  it("syncs active members when linking an existing WorkOS org missing from the workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await user.setWorkOSUserId("user_workos_2");
    await MembershipFactory.associate(workspace, user, { role: "user" });

    await WorkspaceResource.updateWorkOSOrganizationId(workspace.id, null);
    const lightWorkspace = {
      ...renderLightWorkspaceType({ workspace }),
      workOSOrganizationId: null,
    };

    mockGetOrganizationByExternalId.mockResolvedValue(
      mockOrganization({
        id: "org_existing",
        name: workspace.name,
        externalId: workspace.sId,
      })
    );

    const result = await getOrCreateWorkOSOrganization(lightWorkspace);

    expect(result.isOk()).toBe(true);
    expect(mockCreateOrganization).not.toHaveBeenCalled();
    expect(mockCreateOrganizationMembership).toHaveBeenCalledWith({
      userId: "user_workos_2",
      organizationId: "org_existing",
      roleSlug: "user",
    });
  });

  it("does not re-sync members when workspace already has the WorkOS org id", async () => {
    const workspace = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(
      workspace.id,
      "org_already"
    );
    const lightWorkspace = {
      ...renderLightWorkspaceType({ workspace }),
      workOSOrganizationId: "org_already",
    };

    mockGetOrganizationByExternalId.mockResolvedValue(
      mockOrganization({
        id: "org_already",
        name: workspace.name,
        externalId: workspace.sId,
      })
    );

    const spy = vi.spyOn(MembershipResource, "getActiveMemberships");

    const result = await getOrCreateWorkOSOrganization(lightWorkspace);

    expect(result.isOk()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(mockCreateOrganizationMembership).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("skips members without a workOSUserId", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await user.setWorkOSUserId(null);
    expect(user.workOSUserId).toBeNull();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    await WorkspaceResource.updateWorkOSOrganizationId(workspace.id, null);
    const lightWorkspace = {
      ...renderLightWorkspaceType({ workspace }),
      workOSOrganizationId: null,
    };

    mockGetOrganizationByExternalId.mockRejectedValue(
      new WorkOSNotFoundError()
    );
    mockCreateOrganization.mockResolvedValue(
      mockOrganization({
        id: "org_skip",
        name: workspace.name,
        externalId: workspace.sId,
      })
    );

    const result = await getOrCreateWorkOSOrganization(lightWorkspace);

    expect(result.isOk()).toBe(true);
    expect(mockCreateOrganizationMembership).not.toHaveBeenCalled();
  });
});
