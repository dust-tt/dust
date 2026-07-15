import type {
  ManifestToolEntry,
  ToolEntry,
  ToolGroup,
  ToolManifest,
} from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";

const TOOL_GROUPS = [
  "system",
  "dust",
  "python",
  "node",
] as const satisfies readonly ToolGroup[];

export function createToolManifest(tools: readonly ToolEntry[]): ToolManifest {
  const toolsByGroup: Record<ToolGroup, ManifestToolEntry[]> = {
    system: [],
    dust: [],
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
    toolsByGroup[tool.group ?? tool.runtime].push(entry);
  }

  const filteredTools: Partial<
    Record<ToolGroup, readonly ManifestToolEntry[]>
  > = {};
  for (const group of TOOL_GROUPS) {
    if (toolsByGroup[group].length > 0) {
      filteredTools[group] = toolsByGroup[group];
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
  return TOOL_GROUPS.flatMap((group) => {
    const tools = manifest.tools[group];
    if (!tools) {
      return [];
    }

    const entries = new Set(
      tools.map((tool) =>
        tool.version ? `${tool.name} ${tool.version}` : tool.name
      )
    );
    const label = group.charAt(0).toUpperCase() + group.slice(1);

    return [`- ${label}: ${[...entries].join(", ")}`];
  }).join("\n");
}

export function toolManifestToYAML(manifest: ToolManifest): string {
  return yaml.dump(manifest);
}
