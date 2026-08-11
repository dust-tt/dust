import {
  isFuseStatfsMagic,
  isValidPodDatabaseName,
  parseLiveDatabaseNames,
  parseReplicaDatabaseNames,
  syncPodDatabaseAfterCreate,
  syncPodDatabaseToReplica,
} from "@app/lib/api/sandbox/db";
import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
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

  test("recognizes the FUSE statfs magic", () => {
    expect(isFuseStatfsMagic("65735546")).toBe(true);
    expect(isFuseStatfsMagic("65735546\n")).toBe(true);
    expect(isFuseStatfsMagic("65735546 ")).toBe(true);

    // ext4 / overlayfs magics: the underlying directory after a clean unmount.
    expect(isFuseStatfsMagic("ef53")).toBe(false);
    expect(isFuseStatfsMagic("794c7630")).toBe(false);
    expect(isFuseStatfsMagic("")).toBe(false);
  });
});

async function setupSandbox() {
  const { authenticator } = await createResourceTest({ role: "admin" });
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  return { authenticator, sandbox };
}

describe("syncPodDatabaseToReplica", () => {
  test("runs one litestream sync through the daemon socket", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const execRoot = vi
      .spyOn(sandbox, "execRoot")
      .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));

    const result = await syncPodDatabaseToReplica(
      authenticator,
      sandbox,
      "chat"
    );

    expect(result.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(1);
    const command = execRoot.mock.calls[0][1].command;
    expect(command).toContain("/opt/bin/litestream sync -wait");
    expect(command).toContain("-socket /run/litestream/litestream.sock");
    expect(command).toContain("-- /pod-state/databases/chat.db");
  });

  test("surfaces a non-zero exit as an error", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    vi.spyOn(sandbox, "execRoot").mockResolvedValue(
      new Ok({ exitCode: 1, stdout: "", stderr: "no matching database" })
    );

    const result = await syncPodDatabaseToReplica(
      authenticator,
      sandbox,
      "chat"
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("litestream sync of chat");
    expect(result.error.message).toContain("no matching database");
  });
});

describe("syncPodDatabaseAfterCreate", () => {
  test("retries past the watcher discovery delay and succeeds", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const execRoot = vi
      .spyOn(sandbox, "execRoot")
      .mockResolvedValueOnce(
        new Ok({ exitCode: 1, stdout: "", stderr: "no matching database" })
      )
      .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" }));

    const result = await syncPodDatabaseAfterCreate(
      authenticator,
      sandbox,
      "chat",
      { retryDelayMs: 0 }
    );

    expect(result.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(2);
  });

  test("does not retry when the sandbox is gone", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const execRoot = vi
      .spyOn(sandbox, "execRoot")
      .mockResolvedValue(new Err(new SandboxNotFoundError("test-provider-id")));

    const result = await syncPodDatabaseAfterCreate(
      authenticator,
      sandbox,
      "chat",
      { retryDelayMs: 0 }
    );

    expect(result.isErr()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(1);
  });

  test("gives up after the bounded attempts and returns the last error", async () => {
    const { authenticator, sandbox } = await setupSandbox();
    const execRoot = vi
      .spyOn(sandbox, "execRoot")
      .mockResolvedValue(new Err(new Error("daemon socket unavailable")));

    const result = await syncPodDatabaseAfterCreate(
      authenticator,
      sandbox,
      "chat",
      { retryDelayMs: 0 }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("daemon socket unavailable");
    expect(execRoot).toHaveBeenCalledTimes(3);
  });
});
