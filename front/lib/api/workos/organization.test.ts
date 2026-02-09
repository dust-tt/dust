import type { Connection, Directory } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LightWorkspaceType } from "@app/types";
import { Ok } from "@app/types";

const {
  mockListConnections,
  mockDeleteConnection,
  mockListDirectories,
  mockDeleteDirectory,
  mockDisableSSOEnforcement,
} = vi.hoisted(() => ({
  mockListConnections: vi.fn(),
  mockDeleteConnection: vi.fn(),
  mockListDirectories: vi.fn(),
  mockDeleteDirectory: vi.fn(),
  mockDisableSSOEnforcement: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    sso: {
      listConnections: mockListConnections,
      deleteConnection: mockDeleteConnection,
    },
    directorySync: {
      listDirectories: mockListDirectories,
      deleteDirectory: mockDeleteDirectory,
    },
  }),
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    disableSSOEnforcement: mockDisableSSOEnforcement,
  },
}));

import { disableWorkOSSSOAndSCIM } from "@app/lib/api/workos/organization";

function makeWorkspace(
  overrides: Partial<LightWorkspaceType> = {}
): LightWorkspaceType {
  return {
    id: 1,
    sId: "ws-test",
    name: "Test Workspace",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    workOSOrganizationId: "org_123",
    metadata: null,
    role: "admin",
    ...overrides,
  };
}

function makeConnection(id: string): Connection {
  return { id } as Connection;
}

function makeDirectory(id: string): Directory {
  return { id } as Directory;
}

describe("disableWorkOSSSOAndSCIM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListConnections.mockResolvedValue({ data: [] });
    mockDeleteConnection.mockResolvedValue(undefined);
    mockListDirectories.mockResolvedValue({ data: [] });
    mockDeleteDirectory.mockResolvedValue(undefined);
    mockDisableSSOEnforcement.mockResolvedValue(new Ok(undefined));
  });

  it("should skip cleanup when workspace has no WorkOS organization", async () => {
    const workspace = makeWorkspace({ workOSOrganizationId: null });

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: true,
    });

    expect(mockListConnections).not.toHaveBeenCalled();
    expect(mockListDirectories).not.toHaveBeenCalled();
    expect(mockDisableSSOEnforcement).not.toHaveBeenCalled();
  });

  it("should delete SSO connections and disable enforcement when disableSSO is true", async () => {
    const workspace = makeWorkspace();
    const conn = makeConnection("conn_1");
    mockListConnections.mockResolvedValue({ data: [conn] });

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: false,
    });

    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org_123",
    });
    expect(mockDeleteConnection).toHaveBeenCalledWith("conn_1");
    expect(mockDisableSSOEnforcement).toHaveBeenCalledWith(workspace.id);
    expect(mockListDirectories).not.toHaveBeenCalled();
  });

  it("should delete SCIM directories when disableSCIM is true", async () => {
    const workspace = makeWorkspace();
    const dir = makeDirectory("dir_1");
    mockListDirectories.mockResolvedValue({ data: [dir] });

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: false,
      disableSCIM: true,
    });

    expect(mockListDirectories).toHaveBeenCalledWith({
      organizationId: "org_123",
    });
    expect(mockDeleteDirectory).toHaveBeenCalledWith("dir_1");
    expect(mockListConnections).not.toHaveBeenCalled();
    expect(mockDisableSSOEnforcement).not.toHaveBeenCalled();
  });

  it("should delete both SSO and SCIM when both flags are true", async () => {
    const workspace = makeWorkspace();
    const conn = makeConnection("conn_1");
    const dir = makeDirectory("dir_1");
    mockListConnections.mockResolvedValue({ data: [conn] });
    mockListDirectories.mockResolvedValue({ data: [dir] });

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: true,
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith("conn_1");
    expect(mockDisableSSOEnforcement).toHaveBeenCalledWith(workspace.id);
    expect(mockDeleteDirectory).toHaveBeenCalledWith("dir_1");
  });

  it("should delete multiple SSO connections", async () => {
    const workspace = makeWorkspace();
    const conns = [makeConnection("conn_1"), makeConnection("conn_2")];
    mockListConnections.mockResolvedValue({ data: conns });

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: false,
    });

    expect(mockDeleteConnection).toHaveBeenCalledTimes(2);
    expect(mockDeleteConnection).toHaveBeenCalledWith("conn_1");
    expect(mockDeleteConnection).toHaveBeenCalledWith("conn_2");
  });

  it("should continue on individual SSO connection delete failure", async () => {
    const workspace = makeWorkspace();
    const conns = [makeConnection("conn_1"), makeConnection("conn_2")];
    mockListConnections.mockResolvedValue({ data: conns });
    mockDeleteConnection
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce(undefined);

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: false,
    });

    expect(mockDeleteConnection).toHaveBeenCalledTimes(2);
    expect(mockDisableSSOEnforcement).toHaveBeenCalled();
  });

  it("should continue when listing SSO connections fails", async () => {
    const workspace = makeWorkspace();
    mockListConnections.mockRejectedValue(new Error("list failed"));

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: true,
      disableSCIM: true,
    });

    expect(mockDeleteConnection).not.toHaveBeenCalled();
    // SSO enforcement should still be attempted.
    expect(mockDisableSSOEnforcement).toHaveBeenCalled();
    // SCIM should still be attempted.
    expect(mockListDirectories).toHaveBeenCalled();
  });

  it("should do nothing when both flags are false", async () => {
    const workspace = makeWorkspace();

    await disableWorkOSSSOAndSCIM(workspace, {
      disableSSO: false,
      disableSCIM: false,
    });

    expect(mockListConnections).not.toHaveBeenCalled();
    expect(mockListDirectories).not.toHaveBeenCalled();
    expect(mockDisableSSOEnforcement).not.toHaveBeenCalled();
  });
});
