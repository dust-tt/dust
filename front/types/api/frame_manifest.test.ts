import {
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FrameManifestSchema,
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import { describe, expect, it } from "vitest";

const MANIFEST = {
  version: 1,
  name: "Task List",
  description: "Track tasks.",
};

const FUNCTION = {
  name: "add-task",
  description: "Add a task.",
  entryPoint: "functions/add_task.ts",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  outputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
};

describe("FrameManifestSchema", () => {
  it("defaults the single UI entry point to index.tsx", () => {
    const parsed = FrameManifestSchema.safeParse(MANIFEST);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.uiEntryPoint).toBe(FRAME_DEFAULT_UI_ENTRY_POINT);
      expect(parsed.data.functions).toEqual([]);
    }
  });

  it("parses an explicit UI entry point", () => {
    const explicit = FrameManifestSchema.safeParse({
      ...MANIFEST,
      uiEntryPoint: "ui/App.tsx",
    });
    expect(explicit.success).toBe(true);
  });

  it("parses function declarations", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [FUNCTION],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.functions).toEqual([FUNCTION]);
    }
  });

  it("rejects unsafe function entry points", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [
        {
          ...FUNCTION,
          entryPoint: "../add_task.ts",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate function names", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [
        FUNCTION,
        { ...FUNCTION, entryPoint: "functions/add_another_task.ts" },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects function names that cannot become slugs", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [{ ...FUNCTION, name: "Add Task" }],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid function contracts", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [
        {
          ...FUNCTION,
          inputSchema: { type: "unsupported" },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("returns a useful error for invalid JSON", () => {
    const parsed = parseFrameManifest(Buffer.from("{"));

    expect(parsed.isErr()).toBe(true);
    if (parsed.isErr()) {
      expect(parsed.error).toContain("manifest.json is not valid JSON");
    }
  });
});

describe("isSafeFrameRelativePath", () => {
  it.each([
    ["index.tsx", true],
    ["src/ui/App.tsx", true],
    ["../index.tsx", false],
    ["src/../index.tsx", false],
    ["/index.tsx", false],
    ["src\\index.tsx", false],
  ])("validates %s", (relativePath, expected) => {
    expect(isSafeFrameRelativePath(relativePath)).toBe(expected);
  });
});
