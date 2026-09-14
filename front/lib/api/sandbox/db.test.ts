import {
  checkReplicaMountLiveness,
  isFuseStatfsMagic,
  isValidPodDatabaseName,
  parseLiveDatabaseNames,
  parseReplicaDatabaseNames,
} from "@app/lib/api/sandbox/db";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { Ok } from "@app/types/shared/result";
import { describe, expect, test, vi } from "vitest";

describe("pod state helpers", () => {
  test("validates database names against the contract shape", () => {
    expect(isValidPodDatabaseName("chat")).toBe(true);
    expect(isValidPodDatabaseName("a")).toBe(true);
    expect(isValidPodDatabaseName("chat_v2")).toBe(true);
    expect(isValidPodDatabaseName("a".repeat(64))).toBe(true);

    expect(isValidPodDatabaseName("a".repeat(65))).toBe(false);
    expect(isValidPodDatabaseName("")).toBe(false);
    expect(isValidPodDatabaseName("Chat")).toBe(false);
    expect(isValidPodDatabaseName("1chat")).toBe(false);
    expect(isValidPodDatabaseName("_chat")).toBe(false);
    expect(isValidPodDatabaseName("chat-db")).toBe(false);
    expect(isValidPodDatabaseName(".restore-chat")).toBe(false);
    expect(isValidPodDatabaseName("-o")).toBe(false);
    expect(isValidPodDatabaseName("chat db")).toBe(false);
  });

  test("parses replica enumeration output (watcher {db}.db layout), dropping non-conforming entries", () => {
    const findOutput = [
      // The directory watcher names replica subdirs by database FILENAME.
      "/sandbox-state/replica/chat.db",
      "/sandbox-state/replica/tasks.db",
      // Hostile or accidental entries a workload could plant elsewhere or a
      // partial write could leave behind: all dropped by the name allowlist.
      "/sandbox-state/replica/.hidden.db",
      "/sandbox-state/replica/Invalid-Name.db",
      "/sandbox-state/replica/-o.db",
      "/sandbox-state/replica/no-db-suffix",
      "",
      "  ",
    ].join("\n");

    expect(parseReplicaDatabaseNames(findOutput)).toEqual(["chat", "tasks"]);
    expect(parseReplicaDatabaseNames("")).toEqual([]);
  });

  test("parses live database enumeration output", () => {
    const findOutput = [
      "/sandbox-state/databases/chat.db",
      "/sandbox-state/databases/tasks.db",
      "/sandbox-state/databases/.restore-chat.db",
      "/sandbox-state/databases/UPPER.db",
      "/sandbox-state/databases/not-a-db.txt",
    ].join("\n");

    expect(parseLiveDatabaseNames(findOutput)).toEqual(["chat", "tasks"]);
    expect(parseLiveDatabaseNames("")).toEqual([]);
  });

  test("recognizes the FUSE statfs magic", () => {
    expect(isFuseStatfsMagic("65735546")).toBe(true);
    expect(isFuseStatfsMagic("65735546\n")).toBe(true);
    expect(isFuseStatfsMagic("65735546 ")).toBe(true);

    // ext4 / overlayfs magics: the underlying directory after a clean unmount.
    expect(isFuseStatfsMagic("ef53")).toBe(false);
    expect(isFuseStatfsMagic("794c7630")).toBe(false);
    expect(isFuseStatfsMagic("")).toBe(false);
  });

  test("checks the canonical sandbox-state replica mount", async () => {
    const execRoot = vi
      .fn()
      .mockResolvedValue(
        new Ok({ exitCode: 0, stdout: "65735546\n", stderr: "" })
      );

    const result = await checkReplicaMountLiveness(
      {} as never,
      { execRoot } as never
    );

    expect(result.isOk()).toBe(true);
    expect(
      renderRootCommand(execRoot.mock.calls[0][1] as RootCommand)
    ).toContain("/sandbox-state/replica");
    expect(execRoot).toHaveBeenCalledTimes(1);
  });

  test("falls back to the legacy replica mount for old images", async () => {
    const execRoot = vi
      .fn()
      .mockResolvedValueOnce(
        new Ok({ exitCode: 1, stdout: "", stderr: "No such file" })
      )
      .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
      .mockResolvedValueOnce(
        new Ok({ exitCode: 0, stdout: "65735546\n", stderr: "" })
      );

    const result = await checkReplicaMountLiveness(
      {} as never,
      { execRoot } as never
    );

    expect(result.isOk()).toBe(true);
    expect(
      renderRootCommand(execRoot.mock.calls[2][1] as RootCommand)
    ).toContain("/pod-state/replica");
    expect(execRoot).toHaveBeenCalledTimes(3);
  });

  test("does not fall back when the canonical path is present but not FUSE", async () => {
    const execRoot = vi
      .fn()
      .mockResolvedValue(new Ok({ exitCode: 0, stdout: "ef53\n", stderr: "" }));

    const result = await checkReplicaMountLiveness(
      {} as never,
      { execRoot } as never
    );

    expect(result.isErr()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(1);
  });

  test("does not fall back when the canonical root exists but its mount is missing", async () => {
    const execRoot = vi
      .fn()
      .mockResolvedValueOnce(
        new Ok({ exitCode: 1, stdout: "", stderr: "No such file" })
      )
      .mockResolvedValueOnce(new Ok({ exitCode: 1, stdout: "", stderr: "" }));

    const result = await checkReplicaMountLiveness(
      {} as never,
      { execRoot } as never
    );

    expect(result.isErr()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(2);
  });
});
