import {
  isValidPodDatabaseName,
  parseLiveDatabaseNames,
  parseReplicaDatabaseNames,
} from "@app/lib/api/sandbox/db";
import { describe, expect, test } from "vitest";

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
      "/pod-state/replica/chat.db",
      "/pod-state/replica/tasks.db",
      // Hostile or accidental entries a workload could plant elsewhere or a
      // partial write could leave behind: all dropped by the name allowlist.
      "/pod-state/replica/.hidden.db",
      "/pod-state/replica/Invalid-Name.db",
      "/pod-state/replica/-o.db",
      "/pod-state/replica/no-db-suffix",
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
});
