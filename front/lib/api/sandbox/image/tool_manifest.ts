import type {
  ManifestToolEntry,
  ToolCategory,
  ToolEntry,
  ToolManifest,
} from "@app/lib/api/sandbox/image/types";
import { TOOL_CATEGORIES } from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";

export function createToolManifest(tools: readonly ToolEntry[]): ToolManifest {
  const toolsByCategory: Record<ToolCategory, ManifestToolEntry[]> = {
    system: [],
    office: [],
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
    toolsByCategory[tool.category ?? tool.runtime].push(entry);
  }

  const filteredTools: Partial<
    Record<ToolCategory, readonly ManifestToolEntry[]>
  > = {};
  for (const category of TOOL_CATEGORIES) {
    if (toolsByCategory[category].length > 0) {
      filteredTools[category] = toolsByCategory[category];
    }
  }

  return {
    version: "1.0",
    tools: filteredTools,
  };
}

export function toolManifestToJSON(manifest: ToolManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function toolManifestToCompactText(manifest: ToolManifest): string {
  return TOOL_CATEGORIES.flatMap((category) => {
    const tools = manifest.tools[category];
    if (!tools) {
      return [];
    }

    const entries = new Set(
      tools.map((tool) =>
        tool.version ? `${tool.name} ${tool.version}` : tool.name
      )
    );
    const label = category.charAt(0).toUpperCase() + category.slice(1);

    return [`- ${label}: ${[...entries].join(", ")}`];
  }).join("\n");
}

export function toolManifestToYAML(manifest: ToolManifest): string {
  return yaml.dump(manifest);
}
