import {
  FRAME_DATABASE_NAME_REGEX,
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FrameManifestSchema,
  isSafeFrameRelativePath,
  MAX_FRAME_DATABASE_COUNT,
  MAX_FRAME_DOMAIN_COUNT,
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
      expect(parsed.data.databases).toEqual([]);
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

  it("parses database declarations", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      databases: [{ name: "task_store", schema: "databases/task_store.db.ts" }],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid database names and schema paths", () => {
    expect(FRAME_DATABASE_NAME_REGEX.test("task_store")).toBe(true);
    expect(
      FrameManifestSchema.safeParse({
        ...MANIFEST,
        databases: [{ name: "Task Store", schema: "databases/tasks.db.ts" }],
      }).success
    ).toBe(false);
    expect(
      FrameManifestSchema.safeParse({
        ...MANIFEST,
        databases: [{ name: "tasks", schema: "../tasks.db.ts" }],
      }).success
    ).toBe(false);
  });

  it("rejects duplicate database names", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      databases: [
        { name: "tasks", schema: "databases/tasks.db.ts" },
        { name: "tasks", schema: "databases/tasks_v2.db.ts" },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("bounds database reconciliation within the publication lease", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      databases: Array.from(
        { length: MAX_FRAME_DATABASE_COUNT + 1 },
        (_, index) => ({
          name: `database_${index}`,
          schema: `databases/database_${index}.db.ts`,
        })
      ),
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

describe("FrameManifestSchema domains", () => {
  it("defaults to no domains", () => {
    const parsed = FrameManifestSchema.safeParse(MANIFEST);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.domains).toEqual([]);
    }
  });

  it("normalizes and deduplicates declared domains", () => {
    const parsed = FrameManifestSchema.safeParse({
      ...MANIFEST,
      domains: ["API.Stripe.COM", "api.stripe.com", "*.stripe.com"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.domains).toEqual(["api.stripe.com", "*.stripe.com"]);
    }
  });

  it("rejects malformed domains", () => {
    expect(
      FrameManifestSchema.safeParse({ ...MANIFEST, domains: ["api.*.com"] })
        .success
    ).toBe(false);
    expect(
      FrameManifestSchema.safeParse({ ...MANIFEST, domains: [""] }).success
    ).toBe(false);
  });

  it("bounds the number of declared domains", () => {
    const domains = Array.from(
      { length: MAX_FRAME_DOMAIN_COUNT + 1 },
      (_, index) => `host-${index}.example.com`
    );
    expect(
      FrameManifestSchema.safeParse({ ...MANIFEST, domains }).success
    ).toBe(false);
  });
});
