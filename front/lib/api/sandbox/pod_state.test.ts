import {
  compareDottedVersions,
  isValidPodDatabaseName,
  parseLiveDatabaseNames,
  parseReplicaDatabaseNames,
  podStateVersionSupported,
} from "@app/lib/api/sandbox/pod_state";
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

  test("compares dotted versions numerically", () => {
    expect(compareDottedVersions("0.8.51", "0.8.51")).toBe(0);
    expect(compareDottedVersions("0.8.52", "0.8.51")).toBeGreaterThan(0);
    expect(compareDottedVersions("0.8.50", "0.8.51")).toBeLessThan(0);
    expect(compareDottedVersions("0.9.0", "0.8.51")).toBeGreaterThan(0);
    expect(compareDottedVersions("1.0.0", "0.8.51")).toBeGreaterThan(0);
    // Numeric compare, not lexicographic.
    expect(compareDottedVersions("0.8.100", "0.8.51")).toBeGreaterThan(0);
    // Length mismatch pads with zeros.
    expect(compareDottedVersions("0.8", "0.8.0")).toBe(0);

    expect(compareDottedVersions("0.8.51-rc1", "0.8.51")).toBeNull();
    expect(compareDottedVersions("", "0.8.51")).toBeNull();
    expect(compareDottedVersions("abc", "0.8.51")).toBeNull();
  });

  test("gates pod state on the image version that introduced it", () => {
    // The registry only holds the CURRENT image, so this must be a version
    // threshold, not an exact lookup: sandboxes on 0.8.51 must keep their
    // barrier after the registry moves to 0.8.52+.
    expect(podStateVersionSupported("dust-base", "0.8.51")).toBe(true);
    expect(podStateVersionSupported("dust-base", "0.8.52")).toBe(true);
    expect(podStateVersionSupported("dust-base", "0.9.0")).toBe(true);

    // 0.8.50 is the last upstream image WITHOUT the pod-state bits.
    expect(podStateVersionSupported("dust-base", "0.8.50")).toBe(false);
    expect(podStateVersionSupported("dust-base", "0.8.45")).toBe(false);
    // Pre-versioning rows are legitimately pre-pod-state.
    expect(podStateVersionSupported(null, null)).toBe(false);
    expect(podStateVersionSupported("dust-base", null)).toBe(false);

    // Anomalies must surface as null (the caller alerts), never a silent
    // false.
    expect(podStateVersionSupported("other-image", "0.8.51")).toBeNull();
    expect(podStateVersionSupported("dust-base", "not-a-version")).toBeNull();
  });
});
