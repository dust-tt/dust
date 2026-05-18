import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";

// Sync, in-memory factory for component tests. Distinct from the DB-backed
// MCPServerViewFactory in this same folder, which produces an
// MCPServerViewResource via Sequelize. Use this one for tests that render
// components and only need a plausibly-shaped MCPServerViewType.
export class MCPServerViewTypeFactory {
  private static counter = 0;

  static build(
    overrides: Partial<Omit<MCPServerViewType, "server">> & {
      server?: Partial<MCPServerType>;
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
