import type {
  MCPServerType,
  MCPServerViewType,
  RemoteMCPServerType,
} from "@app/lib/api/mcp";

// Sync, in-memory factory for component tests. Distinct from the DB-backed
// MCPServerViewFactory in this same folder, which produces an
// MCPServerViewResource via Sequelize. Use this one for tests that render
// components and only need a plausibly-shaped MCPServerViewType.
export class MCPServerViewTypeFactory {
  private static counter = 0;

  static build(
    overrides: Partial<Omit<MCPServerViewType, "server">> & {
      // Remote-only fields are optional so tests can set lastError/url without
      // casting, while still accepting plain Partial<MCPServerType> values.
      server?: Partial<MCPServerType> &
        Partial<Pick<RemoteMCPServerType, "url" | "lastError" | "lastSyncAt">>;
    } = {}
  ): MCPServerViewType {
    const id = ++MCPServerViewTypeFactory.counter;
    const { server: serverOverrides, ...rest } = overrides;

    return {
      id,
      sId: `msv_${id}`,
      name: `Test Server ${id}`,
      description: "Test server description",
      spaceId: "sp_1",
      serverType: "remote",
      oAuthUseCase: null,
      editedByUser: null,
      isRestrictedToSkills: false,
      createdAt: 0,
      updatedAt: 0,
      toolsMetadata: undefined,
      server: {
        sId: `rms_${id}`,
        name: `test-server-${id}`,
        version: "1.0.0",
        description: "Test server description",
        icon: "ToolsIcon",
        authorization: null,
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
        tools: [],
        ...serverOverrides,
      },
      ...rest,
    };
  }
}
