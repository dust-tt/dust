import {
  checkReplicaMountLiveness,
  isFuseStatfsMagic,
  isValidPodDatabaseName,
  isValidSandboxDatabaseName,
  parseLiveDatabaseNames,
  parseReplicaDatabaseNames,
} from "@app/lib/api/sandbox/db";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { Ok } from "@app/types/shared/result";
import { describe, expect, test, vi } from "vitest";

describe("sandbox state helpers", () => {
  test("validates database names against the contract shape", () => {
    expect(isValidSandboxDatabaseName("chat")).toBe(true);
    expect(isValidSandboxDatabaseName("a")).toBe(true);
    expect(isValidSandboxDatabaseName("chat_v2")).toBe(true);
    expect(isValidSandboxDatabaseName("a".repeat(64))).toBe(true);

    expect(isValidSandboxDatabaseName("a".repeat(65))).toBe(false);
    expect(isValidSandboxDatabaseName("")).toBe(false);
    expect(isValidSandboxDatabaseName("Chat")).toBe(false);
    expect(isValidSandboxDatabaseName("1chat")).toBe(false);
    expect(isValidSandboxDatabaseName("_chat")).toBe(false);
    expect(isValidSandboxDatabaseName("chat-db")).toBe(false);
    expect(isValidSandboxDatabaseName(".restore-chat")).toBe(false);
    expect(isValidSandboxDatabaseName("-o")).toBe(false);
    expect(isValidSandboxDatabaseName("chat db")).toBe(false);
  });

  test("keeps the Pod database validator as a compatibility alias", () => {
    expect(isValidPodDatabaseName).toBe(isValidSandboxDatabaseName);
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
      "/pod-state/databases/chat.db",
      "/pod-state/databases/tasks.db",
      "/pod-state/databases/.restore-chat.db",
      "/pod-state/databases/UPPER.db",
      "/pod-state/databases/not-a-db.txt",
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
