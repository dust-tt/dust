import * as yaml from "js-yaml";

import type { ToolEntry, ToolManifest } from "./types";

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
