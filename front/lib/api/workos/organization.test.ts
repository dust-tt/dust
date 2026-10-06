import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { Connection, Directory } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListConnections,
  mockDeleteConnection,
  mockListDirectories,
  mockDeleteDirectory,
  mockDisableSSOEnforcement,
  mockCreateEvent,
} = vi.hoisted(() => ({
  mockListConnections: vi.fn(),
  mockDeleteConnection: vi.fn(),
  mockListDirectories: vi.fn(),
  mockDeleteDirectory: vi.fn(),
  mockDisableSSOEnforcement: vi.fn(),
  mockCreateEvent: vi.fn(),
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
    auditLogs: {
      createEvent: mockCreateEvent,
    },
  }),
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    disableSSOEnforcement: mockDisableSSOEnforcement,
  },
}));

import {
  AUDIT_TARGET_NAME_MAX_CHARS,
  createAuditLogEvent,
  disableWorkOSSSOAndSCIM,
} from "@app/lib/api/workos/organization";

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
    regionalModelsOnly: false,
    workOSOrganizationId: "org_123",
    metadata: null,
    metronomeCustomerId: null,
    role: "admin",
    sharingPolicy: "all_scopes",
    locale: "en-US",
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

describe("createAuditLogEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEvent.mockResolvedValue(undefined);
  });

  function makeEvent(
    overrides: Partial<{
      action: string;
      targets: { type: string; id: string; name?: string }[];
      metadata: Record<string, string>;
    }> = {}
  ) {
    return {
      action: overrides.action ?? "conversation.updated",
      actor: { type: "user", id: "user_1", name: "Ada" },
      targets: overrides.targets ?? [
        { type: "workspace", id: "ws-test", name: "Test Workspace" },
      ],
      context: { location: "internal" },
      metadata: overrides.metadata,
    };
  }

  it("truncates oversized target names before sending the event", async () => {
    const workspace = makeWorkspace();
    const longName = "x".repeat(AUDIT_TARGET_NAME_MAX_CHARS + 5_000);

    const result = await createAuditLogEvent({
      workspace,
      event: makeEvent({
        targets: [
          { type: "workspace", id: "ws-test", name: "Test Workspace" },
          { type: "conversation", id: "conv_1", name: longName },
        ],
      }),
    });

    expect(result.isOk()).toBe(true);
    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    const sentTargets = mockCreateEvent.mock.calls[0][1].targets;
    expect(sentTargets[1].name).toHaveLength(AUDIT_TARGET_NAME_MAX_CHARS);
    expect(sentTargets[1].name.endsWith("...[truncated]")).toBe(true);
  });

  it("sends an event that would have exceeded the payload limit without name truncation", async () => {
    const workspace = makeWorkspace();
    // A raw 70k-character name would push JSON.stringify(event) past 60k bytes.
    const hugeName = "y".repeat(70_000);

    const result = await createAuditLogEvent({
      workspace,
      event: makeEvent({
        targets: [{ type: "conversation", id: "conv_1", name: hugeName }],
      }),
    });

    expect(result.isOk()).toBe(true);
    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    expect(mockCreateEvent.mock.calls[0][1].targets[0].name).toHaveLength(
      AUDIT_TARGET_NAME_MAX_CHARS
    );
  });

  it("still skips events that remain oversized after name truncation", async () => {
    const workspace = makeWorkspace();
    const hugeMetadata: Record<string, string> = {};
    for (let i = 0; i < 80; i++) {
      hugeMetadata[`field_${i}`] = "z".repeat(1_000);
    }

    const result = await createAuditLogEvent({
      workspace,
      event: makeEvent({ metadata: hugeMetadata }),
    });

    expect(result.isErr()).toBe(true);
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });
});
