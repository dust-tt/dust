import { DustFileSystem } from "@app/lib/api/file_system";
import { validatePodFileTabs } from "@app/lib/api/projects/file_tabs";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { DustFileSystemError } from "@app/types/file_system";
import { frameContentType } from "@app/types/files";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("validatePodFileTabs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips file existence checks for existing file tab paths", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const stalePath = `pod-${pod.sId}/frames/Activity.tsx`;
    const newPath = `pod-${pod.sId}/frames/New.tsx`;

    const stat = vi.fn(async (path: string) => {
      if (path === newPath) {
        return new Ok({ contentType: frameContentType, sizeBytes: 100 });
      }
      return new Ok(null);
    });

    vi.spyOn(DustFileSystem, "forPod").mockResolvedValue(
      new Ok({ stat } as unknown as DustFileSystem)
    );

    const result = await validatePodFileTabs(
      auth,
      pod,
      [
        {
          path: stalePath,
          title: "Activity",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
        {
          path: newPath,
          title: "New",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      [
        "conversations",
        "tasks",
        "files",
        "apps",
        "connected_data",
        stalePath,
        newPath,
      ],
      { existingFileTabPaths: new Set([stalePath]) }
    );

    expect(result.isOk()).toBe(true);
    expect(stat).not.toHaveBeenCalledWith(stalePath);
    expect(stat).toHaveBeenCalledWith(newPath);
  });

  it("rejects new file tabs whose files are missing", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const missingPath = `pod-${pod.sId}/frames/Missing.tsx`;

    vi.spyOn(DustFileSystem, "forPod").mockResolvedValue(
      new Ok({
        stat: vi.fn(async () => new Ok(null)),
      } as unknown as DustFileSystem)
    );

    const result = await validatePodFileTabs(
      auth,
      pod,
      [
        {
          path: missingPath,
          title: "Missing",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      ["conversations", "tasks", "files", "apps", "connected_data", missingPath]
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        `File tab file not found: ${missingPath}`
      );
    }
  });

  it("accepts previewable non-frame files such as markdown", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const mdPath = `pod-${pod.sId}/notes/readme.md`;

    const stat = vi.fn(async (path: string) => {
      if (path === mdPath) {
        return new Ok({ contentType: "text/markdown", sizeBytes: 42 });
      }
      return new Ok(null);
    });

    vi.spyOn(DustFileSystem, "forPod").mockResolvedValue(
      new Ok({ stat } as unknown as DustFileSystem)
    );

    const result = await validatePodFileTabs(
      auth,
      pod,
      [
        {
          path: mdPath,
          title: "Readme",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      ["conversations", "tasks", "files", "apps", "connected_data", mdPath]
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fileTabs).toEqual([
        {
          path: mdPath,
          title: "Readme",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ]);
    }
  });

  it("rejects files that are not previewable", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const zipPath = `pod-${pod.sId}/archive.zip`;

    vi.spyOn(DustFileSystem, "forPod").mockResolvedValue(
      new Ok({
        stat: vi.fn(
          async () => new Ok({ contentType: "application/zip", sizeBytes: 10 })
        ),
      } as unknown as DustFileSystem)
    );

    const result = await validatePodFileTabs(
      auth,
      pod,
      [
        {
          path: zipPath,
          title: "Archive",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      ["conversations", "tasks", "files", "apps", "connected_data", zipPath]
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        `File tab path is not a previewable file: ${zipPath}`
      );
    }
  });

  it("returns an error when the file system cannot be initialized", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    vi.spyOn(DustFileSystem, "forPod").mockResolvedValue(
      new Err(new DustFileSystemError("unauthorized", "Unauthorized"))
    );

    const result = await validatePodFileTabs(
      auth,
      pod,
      [],
      ["conversations", "tasks", "files", "apps", "connected_data"]
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Failed to initialize file system.");
    }
  });
});
