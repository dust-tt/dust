import * as yaml from "js-yaml";
import { describe, expect, test } from "vitest";

import {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "./tool_manifest";
import type { ToolManifest } from "./types";

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

  test("includes all tools", () => {
    const tools = [
      { name: "curl", description: "HTTP client" },
      { name: "pandas", description: "Data analysis" },
      { name: "custom", description: "Custom tool" },
    ];

    const manifest = createToolManifest(tools);

    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools.map((t) => t.name)).toEqual([
      "curl",
      "pandas",
      "custom",
    ]);
  });
});

describe("toolManifestToJSON()", () => {
  test("generates valid JSON string", () => {
    const manifest = createToolManifest([
      { name: "curl", description: "HTTP client" },
    ]);

    const jsonString = toolManifestToJSON(manifest);

    expect(typeof jsonString).toBe("string");
    expect(() => JSON.parse(jsonString)).not.toThrow();
  });

  test("includes all manifest fields", () => {
    const manifest = createToolManifest([
      { name: "curl", description: "HTTP client" },
    ]);

    const jsonString = toolManifestToJSON(manifest);
    const parsed = JSON.parse(jsonString);

    expect(parsed.version).toBe("1.0");
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.tools).toHaveLength(1);
  });
});

describe("toolManifestToYAML()", () => {
  test("generates valid YAML string", () => {
    const manifest = createToolManifest([
      { name: "curl", description: "HTTP client" },
    ]);

    const yamlString = toolManifestToYAML(manifest);

    expect(typeof yamlString).toBe("string");
    expect(yamlString).toContain("version:");
    expect(yamlString).toContain("tools:");
  });

  test("YAML can be parsed back and matches JSON manifest", () => {
    const tools = [
      { name: "curl", description: "HTTP client" },
      { name: "pandas", description: "Data analysis" },
    ];
    const manifest = createToolManifest(tools);

    const yamlString = toolManifestToYAML(manifest);
    const parsedYaml = yaml.load(yamlString) as ToolManifest;

    expect(parsedYaml.version).toBe(manifest.version);
    expect(parsedYaml.tools).toEqual(manifest.tools);
  });
});
