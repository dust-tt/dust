import type {
  ManifestToolEntry,
  ToolEntry,
  ToolManifest,
  ToolRuntime,
} from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";

export function createToolManifest(tools: readonly ToolEntry[]): ToolManifest {
  const toolsByRuntime: Record<ToolRuntime, ManifestToolEntry[]> = {
    system: [],
    python: [],
    node: [],
  };
  const dustTools: ManifestToolEntry[] = [];

  for (const tool of tools) {
    const entry: ManifestToolEntry = {
      name: tool.name,
      ...(tool.version && { version: tool.version }),
      description: tool.description,
      ...(tool.usage && { usage: tool.usage }),
      ...(tool.returns && { returns: tool.returns }),
    };
    if (tool.isDustTool) {
      dustTools.push(entry);
    } else {
      toolsByRuntime[tool.runtime].push(entry);
    }
  }

  return {
    version: "1.0",
    tools: {
      ...(toolsByRuntime.system.length > 0 && {
        system: toolsByRuntime.system,
      }),
      ...(dustTools.length > 0 && { dust: dustTools }),
      ...(toolsByRuntime.python.length > 0 && {
        python: toolsByRuntime.python,
      }),
      ...(toolsByRuntime.node.length > 0 && { node: toolsByRuntime.node }),
    },
  };
}

export function toolManifestToJSON(manifest: ToolManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function toolManifestToCompactText(manifest: ToolManifest): string {
  const formatTools = (
    label: string,
    tools: readonly ManifestToolEntry[] | undefined
  ): string | null => {
    if (!tools) {
      return null;
    }
    const entries = new Set(
      tools.map((tool) =>
        tool.version ? `${tool.name} ${tool.version}` : tool.name
      )
    );
    return `- ${label}: ${[...entries].join(", ")}`;
  };

  return [
    formatTools("System", manifest.tools.system),
    formatTools("Dust", manifest.tools.dust),
    formatTools("Python", manifest.tools.python),
    formatTools("Node", manifest.tools.node),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function toolManifestToYAML(manifest: ToolManifest): string {
  return yaml.dump(manifest);
}
