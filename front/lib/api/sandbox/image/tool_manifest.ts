import type {
  ManifestToolEntry,
  ToolEntry,
  ToolManifest,
  ToolRuntime,
} from "@app/lib/api/sandbox/image/types";
import { TOOL_RUNTIMES } from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";

export function createToolManifest(tools: readonly ToolEntry[]): ToolManifest {
  const toolsByRuntime: Record<ToolRuntime, ManifestToolEntry[]> = {
    system: [],
    python: [],
    node: [],
  };

  for (const tool of tools) {
    const entry: ManifestToolEntry = {
      name: tool.name,
      ...(tool.version && { version: tool.version }),
      description: tool.description,
      ...(tool.usage && { usage: tool.usage }),
      ...(tool.returns && { returns: tool.returns }),
    };
    toolsByRuntime[tool.runtime].push(entry);
  }

  const filteredTools: Partial<
    Record<ToolRuntime, readonly ManifestToolEntry[]>
  > = {};
  for (const runtime of TOOL_RUNTIMES) {
    if (toolsByRuntime[runtime].length > 0) {
      filteredTools[runtime] = toolsByRuntime[runtime];
    }
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    tools: filteredTools,
  };
}

export function toolManifestToJSON(manifest: ToolManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function toolManifestToYAML(manifest: ToolManifest): string {
  return yaml.dump(manifest);
}
