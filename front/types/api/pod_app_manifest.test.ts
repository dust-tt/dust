import {
  isSafePodAppRelativePath,
  PodAppPublishManifestSchema,
} from "@app/types/api/pod_app_manifest";
import { describe, expect, it } from "vitest";

const FULL_MANIFEST = {
  version: 1,
  name: "Task List",
  description: "Track and manage team tasks.",
  uiEntryPoint: "TaskList.tsx",
  functions: [
    {
      name: "add-task",
      path: "functions/add-task.ts",
      description: "Add a task to the list.",
      executionMode: "fast",
      defaultStake: "low",
    },
  ],
  databases: [{ name: "tasks", path: "databases/tasks.db.ts" }],
};

describe("PodAppPublishManifestSchema", () => {
  it("parses a full manifest with an explicit uiEntryPoint", () => {
    const parsed = PodAppPublishManifestSchema.safeParse(FULL_MANIFEST);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.uiEntryPoint).toEqual("TaskList.tsx");
    }
  });

  it("treats an omitted uiEntryPoint and sections as empty/undefined", () => {
    const parsed = PodAppPublishManifestSchema.safeParse({
      version: 1,
      name: "Fns Only",
      description: "",
      functions: [
        {
          name: "greet",
          path: "src/greet.ts",
          description: "Greet.",
          executionMode: "durable",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.uiEntryPoint).toBeUndefined();
      expect(parsed.data.databases).toEqual([]);
      expect(parsed.data.functions[0].defaultStake).toBeUndefined();
    }
  });

  it("accepts a function source at a non-conventional path", () => {
    const parsed = PodAppPublishManifestSchema.safeParse({
      ...FULL_MANIFEST,
      functions: [
        {
          name: "add-task",
          path: "src/tasks/add.ts",
          description: "Add.",
          executionMode: "fast",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["unknown version", { ...FULL_MANIFEST, version: 2 }],
    ["missing name", { ...FULL_MANIFEST, name: undefined }],
    ["missing description", { ...FULL_MANIFEST, description: undefined }],
    [
      "uiEntryPoint escaping the folder",
      {
        ...FULL_MANIFEST,
        uiEntryPoint: "../Other/App.tsx",
      },
    ],
    [
      "absolute uiEntryPoint path",
      { ...FULL_MANIFEST, uiEntryPoint: "/etc/passwd" },
    ],
    [
      "backslash uiEntryPoint path",
      { ...FULL_MANIFEST, uiEntryPoint: "sub\\App.tsx" },
    ],
    [
      "uppercase function name",
      {
        ...FULL_MANIFEST,
        functions: [
          {
            name: "AddTask",
            path: "functions/add.ts",
            description: "Add.",
            executionMode: "fast",
          },
        ],
      },
    ],
    [
      "function missing executionMode",
      {
        ...FULL_MANIFEST,
        functions: [
          { name: "add-task", path: "functions/add.ts", description: "Add." },
        ],
      },
    ],
    [
      "database schema file without .db.ts suffix",
      {
        ...FULL_MANIFEST,
        databases: [{ name: "tasks", path: "databases/tasks.ts" }],
      },
    ],
    [
      "duplicate function names",
      {
        ...FULL_MANIFEST,
        functions: [
          {
            name: "add-task",
            path: "functions/a.ts",
            description: "A.",
            executionMode: "fast",
          },
          {
            name: "add-task",
            path: "functions/b.ts",
            description: "B.",
            executionMode: "fast",
          },
        ],
      },
    ],
    [
      "duplicate database names",
      {
        ...FULL_MANIFEST,
        databases: [
          { name: "tasks", path: "databases/a.db.ts" },
          { name: "tasks", path: "databases/b.db.ts" },
        ],
      },
    ],
  ])("rejects %s", (_label, manifest) => {
    expect(PodAppPublishManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("isSafePodAppRelativePath", () => {
  it.each([
    ["TaskList.tsx", true],
    ["functions/add.ts", true],
    ["a/b/c.ts", true],
    ["", false],
    ["/abs.ts", false],
    ["../up.ts", false],
    ["a/../b.ts", false],
    ["a/./b.ts", false],
    ["a//b.ts", false],
    ["a\\b.ts", false],
    ["a/", false],
  ])("%s -> %s", (path, expected) => {
    expect(isSafePodAppRelativePath(path)).toBe(expected);
  });
});
