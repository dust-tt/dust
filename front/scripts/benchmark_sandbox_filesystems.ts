import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import config from "@app/lib/api/config";
import { DatabaseFileSystemBackend } from "@app/lib/api/file_system/backends/database_file_system_backend";
import type { FileSystemBackend } from "@app/lib/api/file_system/backends/file_system_backend";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type { FileSystemMount } from "@app/lib/api/file_system/types";
import { getSandboxProvider } from "@app/lib/api/sandbox";
import {
  generateSandboxFileSystemToken,
  revokeAllExecTokensForSandbox,
} from "@app/lib/api/sandbox/access_tokens";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

const BENCHMARK_DIRECTORY_PREFIX = "dust-fs-benchmark";
const BENCHMARK_RUNNER_PATH = "/run/dust-filesystem-benchmark.ts";
const SHARED_RUNNER_PATH = "/run/dust-filesystem-shared-benchmark.ts";
const ACCEPTANCE_RUNNER_PATH = "/run/dust-filesystem-acceptance.sh";
const DATABASE_BINARY_PATH = "/opt/bin/dsbx-filesystem-benchmark";
const DATABASE_RUNTIME_DIRECTORY = "/run/dust-filesystem-benchmark";
const DATABASE_TOKEN_PATH = `${DATABASE_RUNTIME_DIRECTORY}/token`;
const DATABASE_STAGING_PATH = `${DATABASE_RUNTIME_DIRECTORY}/staging`;
const DATABASE_SYSTEMD_UNIT = "dust-filesystem-benchmark.service";
const MOUNT_POINT = "/files";
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;

const BenchmarkResultSchema = z
  .object({
    label: z.string(),
  })
  .passthrough();

type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

const SharedCommandResultSchema = z.object({
  ok: z.boolean(),
  completedAtMs: z.number().optional(),
  detectedAtMs: z.number().optional(),
  attempts: z.number().optional(),
  code: z.string().optional(),
});

type SharedCommandResult = z.infer<typeof SharedCommandResultSchema>;

function mount(kind: "conversation" | "pod", id: string): FileSystemMount {
  const scopedPrefix = `${kind}-${id}`;
  return {
    kind,
    id,
    scopedPrefix,
    sandboxMountPoint: `${MOUNT_POINT}/${scopedPrefix}`,
    legacyPrefix: kind === "conversation" ? "conversation" : "project",
    legacySandboxMountPoint:
      kind === "conversation"
        ? `${MOUNT_POINT}/conversation`
        : `${MOUNT_POINT}/pod`,
    permissions: { canRead: true, canWrite: true },
  };
}

function arrayBuffer(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function expectOk<T, E extends Error>(
  result: Result<T, E>,
  description: string
): T {
  if (result.isErr()) {
    throw new Error(`${description}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.value;
}

async function prepareFixtures(
  backend: FileSystemBackend,
  conversationPrefix: string,
  podPrefix: string,
  benchmarkDirectory: string
): Promise<void> {
  const conversationRoot = `${conversationPrefix}/${benchmarkDirectory}`;
  const podRoot = `${podPrefix}/${benchmarkDirectory}`;
  const directories = [
    conversationRoot,
    `${conversationRoot}/read`,
    `${conversationRoot}/list`,
    `${conversationRoot}/write`,
    `${conversationRoot}/create`,
    `${conversationRoot}/rename`,
    `${conversationRoot}/unlink`,
    `${conversationRoot}/cross`,
    `${conversationRoot}/concurrent`,
    podRoot,
    `${podRoot}/cross`,
  ];

  // This operator benchmark has a fixed, bounded fixture set. Sequential setup
  // keeps PostgreSQL and GCS pressure out of the measured sandbox operations.
  for (const directory of directories) {
    expectOk(
      await backend.mkdir(directory),
      `Create fixture directory ${directory}`
    );
  }

  const sizes = [4096, 1024 * 1024, 8 * 1024 * 1024];
  for (const size of sizes) {
    const content = Buffer.alloc(size, 0x5a);
    for (let sample = 0; sample < 3; sample += 1) {
      expectOk(
        await backend.write(
          `${conversationRoot}/read/cold-${size}-${sample}.bin`,
          content,
          "application/octet-stream"
        ),
        `Write ${size}-byte cold fixture`
      );
    }
    expectOk(
      await backend.write(
        `${conversationRoot}/read/warm-${size}.bin`,
        content,
        "application/octet-stream"
      ),
      `Write ${size}-byte warm fixture`
    );
    for (let sample = 0; sample < 5; sample += 1) {
      expectOk(
        await backend.write(
          `${conversationRoot}/write/target-${size}-${sample}.bin`,
          Buffer.alloc(0),
          "application/octet-stream"
        ),
        `Create ${size}-byte write target`
      );
    }
  }

  for (let sample = 0; sample < 20; sample += 1) {
    expectOk(
      await backend.write(
        `${conversationRoot}/list/entry-${sample.toString().padStart(2, "0")}.txt`,
        "fixture",
        "text/plain"
      ),
      "Write readdir fixture"
    );
  }
  for (let sample = 0; sample < 5; sample += 1) {
    for (const operation of ["rename", "unlink", "cross"] as const) {
      expectOk(
        await backend.write(
          `${conversationRoot}/${operation}/${
            operation === "unlink" ? "target" : "source"
          }-${sample}.bin`,
          "fixture",
          "application/octet-stream"
        ),
        `Write ${operation} fixture`
      );
    }
  }
  for (let sample = 0; sample < 8; sample += 1) {
    expectOk(
      await backend.write(
        `${conversationRoot}/concurrent/target-${sample}.bin`,
        Buffer.alloc(0),
        "application/octet-stream"
      ),
      "Write concurrent-I/O target"
    );
  }
}

async function benchmarkOverwriteRevision(
  workspaceId: number,
  rootId: string,
  benchmarkDirectory: string
): Promise<number> {
  let node = await FileSystemNodeModel.findOne({
    where: {
      workspaceId,
      rootKind: "conversation",
      rootId,
      parentId: null,
    },
  });
  for (const name of [benchmarkDirectory, "write", "target-4096-0.bin"]) {
    if (!node) {
      break;
    }
    node = await FileSystemNodeModel.findOne({
      where: { workspaceId, parentId: node.id, name },
    });
  }
  if (!node || node.kind !== "file") {
    throw new Error("Could not resolve the database benchmark write target.");
  }
  return node.contentRevision;
}

async function databaseNodeAtPath(
  workspaceId: number,
  rootKind: "conversation" | "pod",
  rootId: string,
  segments: string[]
): Promise<FileSystemNodeModel | null> {
  let node = await FileSystemNodeModel.findOne({
    where: { workspaceId, rootKind, rootId, parentId: null },
  });
  for (const name of segments) {
    if (!node) {
      return null;
    }
    node = await FileSystemNodeModel.findOne({
      where: { workspaceId, parentId: node.id, name },
    });
  }
  return node;
}

async function createSandbox(
  auth: Authenticator,
  image: SandboxImage
): Promise<SandboxResource> {
  const createConfig = image.toCreateConfig();
  const provider = getSandboxProvider();
  const created = expectOk(
    await provider.create(createConfig, {
      workspaceId: auth.getNonNullableWorkspace().sId,
    }),
    "Create benchmark sandbox"
  );
  return SandboxResource.makeNew(auth, {
    providerId: created.providerId,
    status: "running",
    baseImage: createConfig.imageId.imageName,
    version: createConfig.imageId.tag,
  });
}

async function startDatabaseMount(
  auth: Authenticator,
  sandbox: SandboxResource,
  mounts: readonly FileSystemMount[],
  binary: Buffer,
  apiUrl: string,
  cacheCapacityMiB: number
): Promise<void> {
  expectOk(
    await sandbox.writeFile(auth, DATABASE_BINARY_PATH, arrayBuffer(binary)),
    "Upload benchmark dsbx binary"
  );
  const token = await generateSandboxFileSystemToken(auth, {
    sandbox,
    roots: mounts
      .filter(
        (mount): mount is FileSystemMount & { kind: "conversation" | "pod" } =>
          mount.kind === "conversation" || mount.kind === "pod"
      )
      .map((mount) => ({
        kind: mount.kind,
        id: mount.id,
        permissions: mount.permissions,
      })),
  });
  const prepare = expectOk(
    await sandbox.execRoot(
      auth,
      rootCommand.and([
        rootCommand.exec("/usr/bin/install", [
          "-d",
          "-o",
          "root",
          "-g",
          "root",
          "-m",
          "700",
          DATABASE_RUNTIME_DIRECTORY,
          DATABASE_STAGING_PATH,
        ]),
        rootCommand.exec("/usr/bin/mkdir", ["-p", MOUNT_POINT]),
        rootCommand.exec("/usr/bin/chown", ["root:root", DATABASE_BINARY_PATH]),
        rootCommand.exec("/usr/bin/chmod", ["755", DATABASE_BINARY_PATH]),
        rootCommand.exec("/usr/bin/install", [
          "-o",
          "root",
          "-g",
          "root",
          "-m",
          "600",
          "/dev/stdin",
          DATABASE_TOKEN_PATH,
        ]),
      ]),
      { stdin: token }
    ),
    "Prepare database filesystem daemon"
  );
  if (prepare.exitCode !== 0) {
    throw new Error(`Prepare database filesystem daemon: ${prepare.stderr}`);
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const start = expectOk(
    await sandbox.execRoot(
      auth,
      rootCommand.unsafeShell(
        `/usr/bin/systemd-run --unit=${DATABASE_SYSTEMD_UNIT} --collect ` +
          `--property=Type=simple --property=Restart=always --property=RestartSec=1s ` +
          `--property=KillMode=control-group --property=TimeoutStopSec=10s ` +
          `${DATABASE_BINARY_PATH} filesystem supervise ` +
          `--mountpoint ${MOUNT_POINT} ` +
          `--staging-dir ${DATABASE_STAGING_PATH} ` +
          `--api-url ${shellEscape(apiUrl)} ` +
          `--workspace-id ${shellEscape(workspaceId)} ` +
          `--token-file ${DATABASE_TOKEN_PATH} ` +
          `--cache-capacity-mib ${cacheCapacityMiB}; ` +
          `i=0; while [ $i -lt 300 ]; do ` +
          `if /usr/bin/mountpoint -q ${MOUNT_POINT} && /usr/bin/stat -f ${MOUNT_POINT} >/dev/null 2>&1; then exit 0; fi; ` +
          `i=$((i+1)); /usr/bin/sleep 0.1; done; ` +
          `/usr/bin/systemctl status ${DATABASE_SYSTEMD_UNIT} --no-pager >&2; ` +
          `/usr/bin/journalctl --unit=${DATABASE_SYSTEMD_UNIT} --no-pager -n 100 >&2; exit 1`,
        "Start the benchmark daemon under systemd and wait for its FUSE mount"
      ),
      { timeoutMs: 40_000 }
    ),
    "Start database filesystem daemon"
  );
  if (start.exitCode !== 0) {
    throw new Error(`Start database filesystem daemon: ${start.stderr}`);
  }
}

async function runBenchmark(
  auth: Authenticator,
  sandbox: SandboxResource,
  runner: Buffer,
  label: string,
  benchmarkDirectory: string
): Promise<BenchmarkResult> {
  expectOk(
    await sandbox.writeFile(auth, BENCHMARK_RUNNER_PATH, arrayBuffer(runner)),
    "Upload benchmark workload"
  );
  const execution = expectOk(
    await sandbox.execRoot(
      auth,
      rootCommand.exec("/opt/bin/bun", [
        BENCHMARK_RUNNER_PATH,
        "--label",
        label,
        "--conversation-root",
        `${MOUNT_POINT}/conversation`,
        "--pod-root",
        `${MOUNT_POINT}/pod`,
        "--benchmark-directory",
        benchmarkDirectory,
      ]),
      { timeoutMs: COMMAND_TIMEOUT_MS }
    ),
    `Run ${label} benchmark`
  );
  if (execution.exitCode !== 0) {
    throw new Error(
      `${label} benchmark failed: ${execution.stderr || execution.stdout}`
    );
  }
  const output = execution.stdout
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith("{"));
  if (!output) {
    throw new Error(`${label} benchmark returned no JSON result.`);
  }
  return BenchmarkResultSchema.parse(JSON.parse(output));
}

async function uploadSharedRunner(
  auth: Authenticator,
  sandbox: SandboxResource,
  runner: Buffer
): Promise<void> {
  expectOk(
    await sandbox.writeFile(auth, SHARED_RUNNER_PATH, arrayBuffer(runner)),
    "Upload shared-namespace benchmark workload"
  );
}

async function runAcceptance(
  auth: Authenticator,
  sandbox: SandboxResource,
  runner: Buffer
): Promise<string> {
  expectOk(
    await sandbox.writeFile(auth, ACCEPTANCE_RUNNER_PATH, arrayBuffer(runner)),
    "Upload FUSE acceptance workload"
  );
  const execution = expectOk(
    await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/bash", ["-x", ACCEPTANCE_RUNNER_PATH]),
      { timeoutMs: COMMAND_TIMEOUT_MS }
    ),
    "Run FUSE acceptance workload"
  );
  if (execution.exitCode !== 0) {
    throw new Error(
      `FUSE acceptance workload failed: ${execution.stderr || execution.stdout}`
    );
  }
  return execution.stdout.trim();
}

async function runSharedCommand(
  auth: Authenticator,
  sandbox: SandboxResource,
  args: string[]
): Promise<SharedCommandResult> {
  const execution = expectOk(
    await sandbox.execRoot(
      auth,
      rootCommand.exec("/opt/bin/bun", [SHARED_RUNNER_PATH, ...args]),
      { timeoutMs: 30_000 }
    ),
    `Run shared-namespace command: ${args.join(" ")}`
  );
  if (execution.exitCode !== 0) {
    throw new Error(
      `Shared-namespace command failed: ${execution.stderr || execution.stdout}`
    );
  }
  const output = execution.stdout
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith("{"));
  if (!output) {
    throw new Error("Shared-namespace command returned no JSON result.");
  }
  return SharedCommandResultSchema.parse(JSON.parse(output));
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function visibilityLag(
  writer: SharedCommandResult,
  reader: SharedCommandResult
): number {
  if (writer.completedAtMs === undefined || reader.detectedAtMs === undefined) {
    throw new Error("The shared-namespace result is missing a timestamp.");
  }
  return reader.detectedAtMs - writer.completedAtMs;
}

async function runSharedNamespaceBenchmark({
  auth,
  writerSandbox,
  readerSandbox,
  backend,
  runner,
  podId,
  podPrefix,
  benchmarkDirectory,
}: {
  auth: Authenticator;
  writerSandbox: SandboxResource;
  readerSandbox: SandboxResource;
  backend: DatabaseFileSystemBackend;
  runner: Buffer;
  podId: string;
  podPrefix: string;
  benchmarkDirectory: string;
}) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const sharedDirectory = `${benchmarkDirectory}/shared`;
  const scopedRoot = `${podPrefix}/${sharedDirectory}`;
  const sandboxRoot = `${MOUNT_POINT}/pod/${sharedDirectory}`;
  expectOk(
    await backend.mkdir(scopedRoot),
    "Create shared benchmark directory"
  );
  for (const [name, content] of [
    ["visibility.txt", "initial"],
    ["rename-source.txt", "rename-content"],
    ["delete.txt", "delete-content"],
    ["race.txt", "race-base"],
  ]) {
    expectOk(
      await backend.write(`${scopedRoot}/${name}`, content, "text/plain"),
      `Create shared benchmark fixture ${name}`
    );
  }

  await Promise.all([
    uploadSharedRunner(auth, writerSandbox, runner),
    uploadSharedRunner(auth, readerSandbox, runner),
  ]);

  const pathSegments = (name: string) => [benchmarkDirectory, "shared", name];
  const revisionOf = async (name: string) => {
    const node = await databaseNodeAtPath(
      workspaceId,
      "pod",
      podId,
      pathSegments(name)
    );
    if (!node || node.kind !== "file") {
      throw new Error(`Could not resolve shared benchmark file ${name}.`);
    }
    return { id: node.id, revision: node.contentRevision };
  };

  await runSharedCommand(auth, readerSandbox, [
    "--operation",
    "warm",
    "--path",
    `${sandboxRoot}/visibility.txt`,
  ]);

  const overwriteSamples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const content = `shared-overwrite-${sample}`;
    const before = await revisionOf("visibility.txt");
    const reader = runSharedCommand(auth, readerSandbox, [
      "--operation",
      "poll-content",
      "--path",
      `${sandboxRoot}/visibility.txt`,
      "--content",
      content,
    ]);
    await delay(100);
    const writer = await runSharedCommand(auth, writerSandbox, [
      "--operation",
      "overwrite",
      "--path",
      `${sandboxRoot}/visibility.txt`,
      "--content",
      content,
    ]);
    const observed = await reader;
    const after = await revisionOf("visibility.txt");
    if (after.revision !== before.revision + 1) {
      throw new Error(
        `Shared overwrite advanced revision by ${after.revision - before.revision}; expected 1.`
      );
    }
    overwriteSamples.push({
      lagMs: visibilityLag(writer, observed),
      attempts: observed.attempts,
      revisionBefore: before.revision,
      revisionAfter: after.revision,
    });
  }

  const createdName = "created-from-writer.txt";
  const createdPath = `${sandboxRoot}/${createdName}`;
  const createReader = runSharedCommand(auth, readerSandbox, [
    "--operation",
    "poll-content",
    "--path",
    createdPath,
    "--content",
    "created-content",
  ]);
  await delay(100);
  const createWriter = await runSharedCommand(auth, writerSandbox, [
    "--operation",
    "create",
    "--path",
    createdPath,
    "--content",
    "created-content",
  ]);
  const createObserved = await createReader;
  const created = await revisionOf(createdName);
  if (created.revision !== 1) {
    throw new Error(
      `A newly created non-empty file has revision ${created.revision}; expected 1.`
    );
  }

  await runSharedCommand(auth, readerSandbox, [
    "--operation",
    "warm",
    "--path",
    `${sandboxRoot}/rename-source.txt`,
  ]);
  const renamedBefore = await revisionOf("rename-source.txt");
  const renameReader = runSharedCommand(auth, readerSandbox, [
    "--operation",
    "poll-content",
    "--path",
    `${sandboxRoot}/rename-destination.txt`,
    "--content",
    "rename-content",
  ]);
  await delay(100);
  const renameWriter = await runSharedCommand(auth, writerSandbox, [
    "--operation",
    "rename",
    "--path",
    `${sandboxRoot}/rename-source.txt`,
    "--destination",
    `${sandboxRoot}/rename-destination.txt`,
  ]);
  const renameObserved = await renameReader;
  const renamedAfter = await revisionOf("rename-destination.txt");
  if (
    renamedAfter.id !== renamedBefore.id ||
    renamedAfter.revision !== renamedBefore.revision
  ) {
    throw new Error(
      "Rename did not preserve node identity and content revision."
    );
  }

  await runSharedCommand(auth, readerSandbox, [
    "--operation",
    "warm",
    "--path",
    `${sandboxRoot}/delete.txt`,
  ]);
  const deleteReader = runSharedCommand(auth, readerSandbox, [
    "--operation",
    "poll-exists",
    "--path",
    `${sandboxRoot}/delete.txt`,
    "--expected",
    "false",
  ]);
  await delay(100);
  const deleteWriter = await runSharedCommand(auth, writerSandbox, [
    "--operation",
    "unlink",
    "--path",
    `${sandboxRoot}/delete.txt`,
  ]);
  const deleteObserved = await deleteReader;
  const deleted = await databaseNodeAtPath(
    workspaceId,
    "pod",
    podId,
    pathSegments("delete.txt")
  );
  if (deleted) {
    throw new Error("Deleted file is still present in PostgreSQL.");
  }

  await Promise.all(
    [writerSandbox, readerSandbox].map((sandbox) =>
      runSharedCommand(auth, sandbox, [
        "--operation",
        "warm",
        "--path",
        `${sandboxRoot}/race.txt`,
      ])
    )
  );
  const raceBefore = await revisionOf("race.txt");
  const raceStartAtMs = Date.now() + 2_000;
  const raceResults = await Promise.all(
    [
      [writerSandbox, "race-writer-a"],
      [readerSandbox, "race-writer-b"],
    ].map(([sandbox, content]) =>
      runSharedCommand(auth, sandbox as SandboxResource, [
        "--operation",
        "race",
        "--path",
        `${sandboxRoot}/race.txt`,
        "--content",
        content as string,
        "--start-at-ms",
        String(raceStartAtMs),
      ])
    )
  );
  const winners = raceResults.filter((result) => result.ok);
  const losers = raceResults.filter((result) => !result.ok);
  if (winners.length !== 1 || losers.length !== 1) {
    throw new Error(
      `Concurrent write race returned ${winners.length} winners and ${losers.length} losers.`
    );
  }
  const raceAfter = await revisionOf("race.txt");
  if (raceAfter.revision !== raceBefore.revision + 1) {
    throw new Error(
      `Concurrent write race advanced revision by ${raceAfter.revision - raceBefore.revision}; expected 1.`
    );
  }
  const winningContent = raceResults[0].ok ? "race-writer-a" : "race-writer-b";
  const convergence = await Promise.all(
    [writerSandbox, readerSandbox].map((sandbox) =>
      runSharedCommand(auth, sandbox, [
        "--operation",
        "poll-content",
        "--path",
        `${sandboxRoot}/race.txt`,
        "--content",
        winningContent,
      ])
    )
  );

  return {
    overwriteSamples,
    createWithContent: {
      lagMs: visibilityLag(createWriter, createObserved),
      attempts: createObserved.attempts,
      revision: created.revision,
    },
    rename: {
      lagMs: visibilityLag(renameWriter, renameObserved),
      attempts: renameObserved.attempts,
      inodeBefore: renamedBefore.id,
      inodeAfter: renamedAfter.id,
      revisionBefore: renamedBefore.revision,
      revisionAfter: renamedAfter.revision,
    },
    delete: {
      lagMs: visibilityLag(deleteWriter, deleteObserved),
      attempts: deleteObserved.attempts,
    },
    concurrentWrite: {
      revisionBefore: raceBefore.revision,
      revisionAfter: raceAfter.revision,
      results: raceResults,
      winningContent,
      convergence,
    },
  };
}

async function destroySandbox(
  auth: Authenticator,
  sandbox: SandboxResource,
  logger: Logger
): Promise<void> {
  const provider = getSandboxProvider();
  const destroyed = await provider.destroy(sandbox.providerId, {
    workspaceId: auth.getNonNullableWorkspace().sId,
  });
  if (destroyed.isErr()) {
    logger.warn(
      { err: destroyed.error, sandboxId: sandbox.sId },
      "Failed to destroy benchmark sandbox"
    );
  }
  await revokeAllExecTokensForSandbox(sandbox.sId);
  const deleted = await sandbox.delete(auth);
  if (deleted.isErr()) {
    logger.warn(
      { err: deleted.error, sandboxId: sandbox.sId },
      "Failed to delete benchmark sandbox row"
    );
  }
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Local workspace string ID",
    },
    userId: {
      type: "string",
      demandOption: true,
      description: "Local user string ID",
    },
    conversationId: {
      type: "string",
      demandOption: true,
      description: "Existing conversation string ID used by the scoped token",
    },
    podId: {
      type: "string",
      demandOption: true,
      description: "Existing Pod string ID used by the scoped token",
    },
    dsbxPath: {
      type: "string",
      demandOption: true,
      description: "Locally built Linux dsbx binary",
    },
    runnerPath: {
      type: "string",
      default: "cli/dust-sandbox/tests/filesystem_benchmark.ts",
      description: "Benchmark workload uploaded to both sandboxes",
    },
    sharedRunnerPath: {
      type: "string",
      default:
        "cli/dust-sandbox/tests/filesystem_shared_namespace_benchmark.ts",
      description: "Two-sandbox shared-namespace workload",
    },
    acceptancePath: {
      type: "string",
      default: "cli/dust-sandbox/tests/filesystem_fuse_acceptance.sh",
      description: "Shell acceptance workload run on the Dust mount",
    },
    apiUrl: {
      type: "string",
      demandOption: true,
      description: "Expected DUST_PROD_API value reachable from E2B",
    },
    output: {
      type: "string",
      default: "/private/tmp/dust-filesystem-benchmark.json",
      description: "Local JSON result path",
    },
    acceptanceOnly: {
      type: "boolean",
      default: false,
      description: "Run only the shell acceptance workload in one sandbox",
    },
    cacheCapacityMiB: {
      type: "number",
      default: 512,
      description:
        "Local content cache size. Use zero with --acceptanceOnly to test eviction while files are open.",
    },
  },
  async (
    {
      wId,
      userId,
      conversationId,
      podId,
      dsbxPath,
      runnerPath,
      sharedRunnerPath,
      acceptancePath,
      apiUrl,
      output,
      acceptanceOnly,
      cacheCapacityMiB,
      execute,
    },
    logger
  ) => {
    if (!Number.isSafeInteger(cacheCapacityMiB) || cacheCapacityMiB < 0) {
      throw new Error("cacheCapacityMiB must be a non-negative integer.");
    }
    const configuredApiUrl = config.getDustAPIConfig().url;
    if (configuredApiUrl !== apiUrl) {
      throw new Error(
        `DUST_PROD_API is ${configuredApiUrl}; expected the explicitly supplied ${apiUrl}.`
      );
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(userId, wId);
    const imageResult = getSandboxImage(auth);
    const image = expectOk(
      imageResult,
      "Resolve production sandbox image"
    ).withNetwork({
      mode: "allow_all",
    });
    const benchmarkDirectory = `${BENCHMARK_DIRECTORY_PREFIX}-${Date.now()}`;
    const mounts = [mount("conversation", conversationId), mount("pod", podId)];
    const conversationPrefix = mounts[0].scopedPrefix;
    const podPrefix = mounts[1].scopedPrefix;
    const gcsBackend = new GCSFileSystemBackend(
      wId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    );
    const databaseBackend = new DatabaseFileSystemBackend(auth, mounts);

    if (!execute) {
      logger.info(
        {
          image: image.imageId ? formatSandboxImageId(image.imageId) : null,
          apiUrl,
          output,
        },
        "Would create three fresh production-image sandboxes and run the filesystem comparison"
      );
      return;
    }

    const binary = await readFile(dsbxPath);
    const runner = await readFile(runnerPath);
    const sharedRunner = await readFile(sharedRunnerPath);
    const acceptanceRunner = await readFile(acceptancePath);
    let gcsSandbox: SandboxResource | null = null;
    let databaseSandbox: SandboxResource | null = null;
    let databasePeerSandbox: SandboxResource | null = null;
    try {
      if (acceptanceOnly) {
        databaseSandbox = await createSandbox(auth, image);
        await startDatabaseMount(
          auth,
          databaseSandbox,
          mounts,
          binary,
          configuredApiUrl,
          cacheCapacityMiB
        );
        const acceptance = await runAcceptance(
          auth,
          databaseSandbox,
          acceptanceRunner
        );
        await writeFile(
          output,
          `${JSON.stringify({ acceptance }, null, 2)}\n`,
          { mode: 0o600 }
        );
        logger.info(
          { output, acceptance },
          "FUSE acceptance workload completed"
        );
        return;
      }

      logger.info({}, "Preparing identical filesystem benchmark fixtures");
      await prepareFixtures(
        gcsBackend,
        conversationPrefix,
        podPrefix,
        benchmarkDirectory
      );
      await prepareFixtures(
        databaseBackend,
        conversationPrefix,
        podPrefix,
        benchmarkDirectory
      );

      gcsSandbox = await createSandbox(auth, image);
      databaseSandbox = await createSandbox(auth, image);
      databasePeerSandbox = await createSandbox(auth, image);
      expectOk(
        await gcsBackend
          .createSandboxAdapter(mounts)
          .setup(auth, gcsSandbox, image),
        "Mount two gcsfuse filesystems"
      );
      await startDatabaseMount(
        auth,
        databaseSandbox,
        mounts,
        binary,
        configuredApiUrl,
        cacheCapacityMiB
      );
      await startDatabaseMount(
        auth,
        databasePeerSandbox,
        mounts,
        binary,
        configuredApiUrl,
        cacheCapacityMiB
      );

      const acceptance = await runAcceptance(
        auth,
        databaseSandbox,
        acceptanceRunner
      );

      const gcsResult = await runBenchmark(
        auth,
        gcsSandbox,
        runner,
        "two-gcsfuse-mounts",
        benchmarkDirectory
      );
      const workspaceId = auth.getNonNullableWorkspace().id;
      const revisionBefore = await benchmarkOverwriteRevision(
        workspaceId,
        conversationId,
        benchmarkDirectory
      );
      const databaseResult = await runBenchmark(
        auth,
        databaseSandbox,
        runner,
        "dust-database-fuse",
        benchmarkDirectory
      );
      const revisionAfter = await benchmarkOverwriteRevision(
        workspaceId,
        conversationId,
        benchmarkDirectory
      );
      if (revisionAfter !== revisionBefore + 1) {
        throw new Error(
          `A truncating overwrite created ${revisionAfter - revisionBefore} revisions; expected 1.`
        );
      }
      const sharedNamespace = await runSharedNamespaceBenchmark({
        auth,
        writerSandbox: databaseSandbox,
        readerSandbox: databasePeerSandbox,
        backend: databaseBackend,
        runner: sharedRunner,
        podId,
        podPrefix,
        benchmarkDirectory,
      });
      const result = {
        measuredAt: new Date().toISOString(),
        image: image.imageId ? formatSandboxImageId(image.imageId) : null,
        binarySha256: createHash("sha256").update(binary).digest("hex"),
        fixtures: {
          coldSamplesPerSize: 3,
          warmSamplesPerSize: 5,
          readdirEntries: 20,
          concurrentFiles: 8,
        },
        atomicTruncate: { revisionBefore, revisionAfter },
        acceptance,
        sharedNamespace,
        results: [gcsResult, databaseResult],
      };
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
        mode: 0o600,
      });
      logger.info(
        { output, results: result.results },
        "Filesystem benchmark completed"
      );
    } finally {
      if (gcsSandbox) {
        await destroySandbox(auth, gcsSandbox, logger);
      }
      if (databaseSandbox) {
        await destroySandbox(auth, databaseSandbox, logger);
      }
      if (databasePeerSandbox) {
        await destroySandbox(auth, databasePeerSandbox, logger);
      }
      for (const backend of [gcsBackend, databaseBackend]) {
        for (const prefix of [conversationPrefix, podPrefix]) {
          const cleanup = await backend.delete(
            `${prefix}/${benchmarkDirectory}`,
            {
              ignoreNotFound: true,
            }
          );
          if (cleanup.isErr()) {
            logger.warn(
              { err: cleanup.error, prefix },
              "Failed to remove benchmark fixtures"
            );
          }
        }
      }
      // The benchmark uses real conversation and Pod roots. Fixture deletion above is
      // deliberately path-scoped; deleting every row under either root would also remove
      // files that belong to the user.
    }
  }
);
