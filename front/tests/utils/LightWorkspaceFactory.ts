import type { LightWorkspaceType } from "@app/types/user";

// Sync, in-memory factory for component tests. Unlike WorkspaceFactory, this
// does not touch the database — use it from tests that render React
// components and only need a plausibly-shaped workspace object.
export class LightWorkspaceFactory {
  private static counter = 0;

  static build(
    overrides: Partial<LightWorkspaceType> = {}
  ): LightWorkspaceType {
    const id = ++LightWorkspaceFactory.counter;
    return {
      id,
      sId: `ws_${id}`,
      name: `Test Workspace ${id}`,
      role: "admin",
      segmentation: null,
      whiteListedProviders: null,
      defaultEmbeddingProvider: null,
      metadata: {},
      sharingPolicy: "workspace_only",
      metronomeCustomerId: null,
      ...overrides,
    };
  }
}
