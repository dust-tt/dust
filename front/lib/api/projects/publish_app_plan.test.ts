import { buildPodAppPublishPlan } from "@app/lib/api/projects/publish_app_plan";
import type { PodAppPublishManifest } from "@app/types/api/pod_app_manifest";
import { describe, expect, it } from "vitest";

const FOLDER_PATH = "pod-vlt_abc/TaskList";

const MANIFEST: PodAppPublishManifest = {
  version: 1,
  name: "Task List",
  description: "Tasks.",
  uiEntryPoint: "TaskList.tsx",
  functions: [
    {
      name: "add-task",
      path: "src/add.ts",
      description: "Add.",
      executionMode: "fast",
      defaultStake: "low",
    },
  ],
  databases: [{ name: "tasks", path: "databases/tasks.db.ts" }],
};

const ALL_REL_PATHS = new Set([
  "manifest.json",
  "TaskList.tsx",
  "src/add.ts",
  "databases/tasks.db.ts",
]);

describe("buildPodAppPublishPlan", () => {
  it("maps manifest entries onto scoped paths", () => {
    const result = buildPodAppPublishPlan({
      manifest: MANIFEST,
      folderPath: FOLDER_PATH,
      folderRelPaths: ALL_REL_PATHS,
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [],
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.functionsToPublish).toEqual([
      {
        name: "add-task",
        scopedPath: `${FOLDER_PATH}/src/add.ts`,
        description: "Add.",
        executionMode: "fast",
        defaultStake: "low",
      },
    ]);
    expect(result.value.databasesToReconcile).toEqual([
      { name: "tasks", scopedPath: `${FOLDER_PATH}/databases/tasks.db.ts` },
    ]);
    expect(result.value.frameToPublish).toEqual({
      relPath: "TaskList.tsx",
      scopedPath: `${FOLDER_PATH}/TaskList.tsx`,
    });
    expect(result.value.functionSlugsToUnpublish).toEqual([]);
    expect(result.value.warnings).toEqual([]);
  });

  it("defaults the frame to index.tsx when uiEntryPoint is omitted and it exists", () => {
    const manifest: PodAppPublishManifest = {
      ...MANIFEST,
      uiEntryPoint: undefined,
    };
    const result = buildPodAppPublishPlan({
      manifest,
      folderPath: FOLDER_PATH,
      folderRelPaths: new Set([
        "manifest.json",
        "index.tsx",
        "src/add.ts",
        "databases/tasks.db.ts",
      ]),
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.frameToPublish).toEqual({
        relPath: "index.tsx",
        scopedPath: `${FOLDER_PATH}/index.tsx`,
      });
    }
  });

  it("rejects a manifest with no uiEntryPoint and no index.tsx in the folder", () => {
    const manifest: PodAppPublishManifest = {
      ...MANIFEST,
      uiEntryPoint: undefined,
    };
    const result = buildPodAppPublishPlan({
      manifest,
      folderPath: FOLDER_PATH,
      folderRelPaths: new Set([
        "manifest.json",
        "src/add.ts",
        "databases/tasks.db.ts",
      ]),
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("index.tsx");
      expect(result.error.message).toContain(
        "every app needs a UI entry point"
      );
    }
  });

  it("rejects an explicit uiEntryPoint that is absent from the folder", () => {
    const manifest: PodAppPublishManifest = {
      ...MANIFEST,
      uiEntryPoint: "Missing.tsx",
    };
    const result = buildPodAppPublishPlan({
      manifest,
      folderPath: FOLDER_PATH,
      folderRelPaths: new Set([
        "manifest.json",
        "src/add.ts",
        "databases/tasks.db.ts",
      ]),
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Missing.tsx");
    }
  });

  it("rejects a manifest referencing files absent from the folder", () => {
    const result = buildPodAppPublishPlan({
      manifest: MANIFEST,
      folderPath: FOLDER_PATH,
      folderRelPaths: new Set(["manifest.json"]),
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("TaskList.tsx");
      expect(result.error.message).toContain("src/add.ts");
    }
  });

  it("plans unpublish for this app's functions the manifest dropped, and only this app's", () => {
    const result = buildPodAppPublishPlan({
      manifest: MANIFEST,
      folderPath: FOLDER_PATH,
      folderRelPaths: ALL_REL_PATHS,
      prefix: "tasklist",
      publishedFunctionSlugs: [
        "tasklist__add-task", // still declared -> kept
        "tasklist__old-fn", // dropped -> unpublish
        "otherapp__old-fn", // another app -> untouched
        "bare-root-fn", // no prefix -> untouched
      ],
      databaseOnDiskNames: [],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.functionSlugsToUnpublish).toEqual([
        "tasklist__old-fn",
      ]);
    }
  });

  it("warns about this app's orphan databases without planning any deletion", () => {
    const result = buildPodAppPublishPlan({
      manifest: MANIFEST,
      folderPath: FOLDER_PATH,
      folderRelPaths: ALL_REL_PATHS,
      prefix: "tasklist",
      publishedFunctionSlugs: [],
      databaseOnDiskNames: [
        "tasklist__tasks", // declared -> no warning
        "tasklist__legacy", // undeclared -> warning
        "otherapp__data", // another app -> untouched
        "bare", // no prefix -> untouched
      ],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain("tasklist__legacy");
    }
  });
});
