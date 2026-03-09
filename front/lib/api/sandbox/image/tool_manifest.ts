import type { ToolEntry, ToolManifest } from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";

export function createToolManifest(tools: readonly ToolEntry[]): ToolManifest {
  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    tools,
  };
}

export function toolManifestToJSON(manifest: ToolManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function toolManifestToYAML(manifest: ToolManifest): string {
  return yaml.dump(manifest);
}
