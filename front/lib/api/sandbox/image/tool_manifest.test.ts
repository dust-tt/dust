import {
  createToolManifest,
  toolManifestToCompactText,
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

  test("groups tools by category", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
      {
        name: "read_file",
        description: "File reader",
        runtime: "system",
        category: "dust",
      },
      {
        name: "xlsx_inspect",
        description: "Workbook inspector",
        runtime: "system",
        category: "dust",
      },
      { name: "pandas", description: "Data analysis", runtime: "python" },
      { name: "tsx", description: "TypeScript executor", runtime: "node" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.system).toEqual([
      { name: "curl", description: "HTTP client" },
    ]);
    expect(manifest.tools.dust).toEqual([
      { name: "read_file", description: "File reader" },
      { name: "xlsx_inspect", description: "Workbook inspector" },
    ]);
    expect(manifest.tools.python).toEqual([
      { name: "pandas", description: "Data analysis" },
    ]);
    expect(manifest.tools.node).toEqual([
      { name: "tsx", description: "TypeScript executor" },
    ]);
  });

  test("omits empty categories", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools.system).toBeDefined();
    expect(manifest.tools.dust).toBeUndefined();
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
    expect(parsed.tools.system).toHaveLength(1);
  });
});

describe("toolManifestToCompactText()", () => {
  test("lists names and versions on one line per category", () => {
    const tools: ToolEntry[] = [
      { name: "curl", description: "HTTP client", runtime: "system" },
      {
        name: "read_file",
        description: "File reader",
        runtime: "system",
        category: "dust",
      },
      {
        name: "xlsx_inspect",
        description: "Workbook inspector",
        runtime: "system",
        category: "dust",
      },
      {
        name: "pandas",
        version: "2.2.3",
        description: "Data analysis",
        runtime: "python",
      },
      { name: "tsx", description: "TypeScript executor", runtime: "node" },
      { name: "curl", description: "HTTP client", runtime: "system" },
    ];
    const manifest = createToolManifest(tools);

    const text = toolManifestToCompactText(manifest);

    expect(text).toBe(
      "- System: curl\n- Dust: read_file, xlsx_inspect\n- Python: pandas 2.2.3\n- Node: tsx"
    );
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
