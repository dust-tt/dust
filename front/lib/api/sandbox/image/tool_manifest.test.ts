import {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image/tool_manifest";
import type { ToolEntry, ToolManifest } from "@app/lib/api/sandbox/image/types";
import * as yaml from "js-yaml";
import { describe, expect, test } from "vitest";

describe("createToolManifest()", () => {
  test("generates manifest with version 1.0", () => {
    const manifest = createToolManifest([]);

    expect(manifest.version).toBe("1.0");
  });

  test("includes generatedAt timestamp", () => {
    const manifest = createToolManifest([]);

    expect(manifest.generatedAt).toBeDefined();
    expect(() => new Date(manifest.generatedAt)).not.toThrow();
  });

  test("groups tools by runtime", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
      { name: "pandas", description: "Data analysis", runtime: "python" },
      { name: "tsx", description: "TypeScript executor", runtime: "node" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.system).toEqual([
      { name: "curl", description: "HTTP client" },
    ]);
    expect(manifest.tools.python).toEqual([
      { name: "pandas", description: "Data analysis" },
    ]);
    expect(manifest.tools.node).toEqual([
      { name: "tsx", description: "TypeScript executor" },
    ]);
  });

  test("omits empty runtime categories", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.system).toBeDefined();
    expect(manifest.tools.python).toBeUndefined();
    expect(manifest.tools.node).toBeUndefined();
  });

  test("includes version when provided", () => {
    const tools: ToolEntry[] = [
      {
        name: "pandas",
        version: "2.2.3",
        description: "Data analysis",
        runtime: "python",
      },
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.python).toEqual([
      { name: "pandas", version: "2.2.3", description: "Data analysis" },
    ]);
    expect(manifest.tools.system).toEqual([
      { name: "curl", description: "HTTP client" },
    ]);
  });

  test("includes usage and returns when provided", () => {
    const tools: ToolEntry[] = [
      {
        name: "read_file",
        description: "Read file with line numbers",
        usage: "read_file <path> [start] [end]",
        returns: "Numbered lines",
        runtime: "system",
      },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.system).toEqual([
      {
        name: "read_file",
        description: "Read file with line numbers",
        usage: "read_file <path> [start] [end]",
        returns: "Numbered lines",
      },
    ]);
  });
});

describe("toolManifestToJSON()", () => {
  test("generates valid JSON string", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];
    const manifest = createToolManifest(tools);

    const jsonString = toolManifestToJSON(manifest);

    expect(typeof jsonString).toBe("string");
    expect(() => JSON.parse(jsonString)).not.toThrow();
  });

  test("includes all manifest fields", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];
    const manifest = createToolManifest(tools);

    const jsonString = toolManifestToJSON(manifest);
    const parsed = JSON.parse(jsonString);

    expect(parsed.version).toBe("1.0");
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.tools.system).toHaveLength(1);
  });
});

describe("toolManifestToYAML()", () => {
  test("generates valid YAML string", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];
    const manifest = createToolManifest(tools);

    const yamlString = toolManifestToYAML(manifest);

    expect(typeof yamlString).toBe("string");
    expect(yamlString).toContain("version:");
    expect(yamlString).toContain("tools:");
  });

  test("YAML can be parsed back and matches JSON manifest", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
      { name: "pandas", description: "Data analysis", runtime: "python" },
    ];
    const manifest = createToolManifest(tools);

    const yamlString = toolManifestToYAML(manifest);
    const parsedYaml = yaml.load(yamlString) as ToolManifest;

    expect(parsedYaml.version).toBe(manifest.version);
    expect(parsedYaml.tools).toEqual(manifest.tools);
  });
});
