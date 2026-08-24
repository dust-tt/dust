import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";

/**
 * Shared fixtures for `publishPodApp` tests (`lib/api/projects/publish_app.test.ts` and
 * `lib/api/actions/servers/sandbox_functions/tools/publish_app.test.ts`), which both exercise the
 * same publish pipeline through two different entry points.
 *
 * The `vi.mock` blocks stay local to each test file: hoisting only reaches the top of the file
 * `vi.mock` is written in, so registering them here would run too late relative to each test
 * file's own (earlier) imports of the mocked modules.
 */

export const MANIFEST = {
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

/** Seeds the pod listing with an app folder's files and its manifest content. */
export function seedAppFolder({
  folder,
  relPaths,
  manifest,
  extraRootFolders = [],
}: {
  folder: string;
  relPaths: string[];
  manifest: unknown;
  extraRootFolders?: { folder: string; relPaths: string[] }[];
}) {
  const all = [{ folder, relPaths }, ...extraRootFolders];
  fileStorageMock.setFilesByPrefix((prefix) =>
    all.flatMap(({ folder: f, relPaths: rps }) =>
      rps.map((relPath) => ({
        name: `${prefix}${f}/${relPath}`,
        metadata: {
          contentType: relPath.endsWith(".tsx")
            ? "application/vnd.dust.frame"
            : "text/plain",
          size: "10",
        },
      }))
    )
  );
  fileStorageMock.setFileContent((filePath) => {
    if (filePath.endsWith(`${folder}/manifest.json`)) {
      return JSON.stringify(manifest);
    }
    // Generic body for any other seeded file (e.g. a frame source read by the auto-create path).
    const isSeeded = all.some(({ folder: f, relPaths: rps }) =>
      rps.some((relPath) => filePath.endsWith(`${f}/${relPath}`))
    );
    return isSeeded ? "// seeded content" : null;
  });
}
