import {
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FrameManifestSchema,
  isSafeFrameRelativePath,
  MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import {
  DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
  DEFAULT_SANDBOX_FUNCTION_STAKE,
} from "@app/types/api/sandbox_functions";
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
      expect(parsed.data.functions).toEqual([
        {
          ...FUNCTION,
          executionMode: DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
          defaultStake: DEFAULT_SANDBOX_FUNCTION_STAKE,
        },
      ]);
    }
  });

  it("parses explicit function execution settings", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [{ ...FUNCTION, executionMode: "fast", defaultStake: "high" }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.functions[0]).toMatchObject({
        executionMode: "fast",
        defaultStake: "high",
      });
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

  it("rejects function descriptions that cannot be persisted", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      functions: [
        {
          ...FUNCTION,
          description: "a".repeat(MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH + 1),
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
