#!/usr/bin/env bun

import {
  chmod,
  copyFile,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

type ProcessSample = {
  cpuTicks: number;
  rssBytes: number;
  processes: number;
};

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function progress(phase: string): void {
  process.stderr.write(`[filesystem-benchmark] ${phase}\n`);
}

function isAccessDenied(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EACCES";
}

async function milliseconds<T>(operation: () => Promise<T>): Promise<{
  elapsedMs: number;
  value: T;
}> {
  const started = performance.now();
  const value = await operation();
  return { elapsedMs: performance.now() - started, value };
}

async function readAndVerify(
  path: string,
  expectedSize: number,
  expectedByte: number
): Promise<number> {
  const bytes = await readFile(path);
  if (
    bytes.byteLength !== expectedSize ||
    bytes.some((byte) => byte !== expectedByte)
  ) {
    throw new Error(`Read returned unexpected bytes for ${path}`);
  }
  return bytes.byteLength;
}

async function overwriteAndSync(
  path: string,
  bytes: Uint8Array
): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_TRUNC);
  try {
    await handle.write(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createAndSync(path: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o644
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function sampleFilesystemProcesses(): Promise<ProcessSample> {
  let cpuTicks = 0;
  let rssBytes = 0;
  let processes = 0;
  const entries = await readdir("/proc", { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => {
        try {
          const base = `/proc/${entry.name}`;
          const command = (
            await readFile(`${base}/cmdline`, "utf8")
          ).replaceAll("\0", " ");
          const isDustMount =
            (command.includes("dsbx") &&
              command.includes("filesystem mount")) ||
            command.includes("/usr/bin/gcsfuse");
          if (!isDustMount) {
            return;
          }
          const stat = await readFile(`${base}/stat`, "utf8");
          const afterName = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
          const status = await readFile(`${base}/status`, "utf8");
          const rssKb = Number(
            status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] ?? 0
          );
          cpuTicks += Number(afterName[11]) + Number(afterName[12]);
          rssBytes += rssKb * 1024;
          processes += 1;
        } catch {
          // A short-lived process may disappear between /proc reads.
        }
      })
  );
  return { cpuTicks, rssBytes, processes };
}

async function main() {
  const label = argument("label");
  const conversationRoot = argument("conversation-root");
  const podRoot = argument("pod-root");
  const benchmarkDirectory = argument("benchmark-directory");
  const benchmarkRoot = `${conversationRoot}/${benchmarkDirectory}`;
  const podBenchmarkRoot = `${podRoot}/${benchmarkDirectory}`;
  const sizes = [4096, 1024 * 1024, 8 * 1024 * 1024];
  const payloads = new Map(
    sizes.map((size) => [size, new Uint8Array(size).fill(0x5a)])
  );

  const initialProcesses = await sampleFilesystemProcesses();
  let peakRssBytes = initialProcesses.rssBytes;
  let sampling = true;
  const sampler = setInterval(() => {
    if (!sampling) {
      return;
    }
    void sampleFilesystemProcesses().then((sample) => {
      peakRssBytes = Math.max(peakRssBytes, sample.rssBytes);
    });
  }, 25);

  const coldReads: Record<string, number[]> = {};
  const warmReads: Record<string, number[]> = {};
  progress("cold and warm reads");
  for (const size of sizes) {
    coldReads[String(size)] = [];
    for (let sample = 0; sample < 3; sample += 1) {
      const result = await milliseconds(() =>
        readAndVerify(
          `${benchmarkRoot}/read/cold-${size}-${sample}.bin`,
          size,
          0x5a
        )
      );
      if (result.value !== size) {
        throw new Error(
          `Cold read returned ${result.value} bytes, expected ${size}`
        );
      }
      coldReads[String(size)].push(result.elapsedMs);
    }

    const warmPath = `${benchmarkRoot}/read/warm-${size}.bin`;
    await readAndVerify(warmPath, size, 0x5a);
    warmReads[String(size)] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const result = await milliseconds(() =>
        readAndVerify(warmPath, size, 0x5a)
      );
      warmReads[String(size)].push(result.elapsedMs);
    }
  }

  const statTimes: number[] = [];
  progress("stat");
  const statPath = `${benchmarkRoot}/read/warm-4096.bin`;
  for (let sample = 0; sample < 20; sample += 1) {
    statTimes.push((await milliseconds(() => stat(statPath))).elapsedMs);
  }

  const readdirTimes: number[] = [];
  progress("readdir");
  for (let sample = 0; sample < 5; sample += 1) {
    const result = await milliseconds(() => readdir(`${benchmarkRoot}/list`));
    if (result.value.length !== 20) {
      throw new Error(
        `readdir returned ${result.value.length} entries, expected 20`
      );
    }
    readdirTimes.push(result.elapsedMs);
  }

  const writeFsync: Record<string, number[]> = {};
  progress("write and fsync");
  for (const size of sizes) {
    writeFsync[String(size)] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const path = `${benchmarkRoot}/write/target-${size}-${sample}.bin`;
      writeFsync[String(size)].push(
        (await milliseconds(() => overwriteAndSync(path, payloads.get(size)!)))
          .elapsedMs
      );
    }
  }

  const createTimes: number[] = [];
  progress("create");
  for (let sample = 0; sample < 5; sample += 1) {
    createTimes.push(
      (
        await milliseconds(() =>
          createAndSync(`${benchmarkRoot}/create/new-${sample}.bin`)
        )
      ).elapsedMs
    );
  }

  const renameTimes: number[] = [];
  progress("rename");
  for (let sample = 0; sample < 5; sample += 1) {
    renameTimes.push(
      (
        await milliseconds(() =>
          rename(
            `${benchmarkRoot}/rename/source-${sample}.bin`,
            `${benchmarkRoot}/rename/destination-${sample}.bin`
          )
        )
      ).elapsedMs
    );
  }

  const unlinkTimes: number[] = [];
  progress("unlink");
  for (let sample = 0; sample < 5; sample += 1) {
    unlinkTimes.push(
      (
        await milliseconds(() =>
          unlink(`${benchmarkRoot}/unlink/target-${sample}.bin`)
        )
      ).elapsedMs
    );
  }

  let crossMountFallbacks = 0;
  const crossMoveTimes: number[] = [];
  progress("conversation to pod move");
  for (let sample = 0; sample < 5; sample += 1) {
    const source = `${benchmarkRoot}/cross/source-${sample}.bin`;
    const destination = `${podBenchmarkRoot}/cross/destination-${sample}.bin`;
    const result = await milliseconds(async () => {
      try {
        await rename(source, destination);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "EXDEV"
        ) {
          throw error;
        }
        crossMountFallbacks += 1;
        await copyFile(source, destination);
        await unlink(source);
      }
    });
    crossMoveTimes.push(result.elapsedMs);
  }

  const concurrentPayload = new Uint8Array(1024 * 1024).fill(0xa5);
  progress("concurrent I/O");
  const concurrent = await milliseconds(() =>
    Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        overwriteAndSync(
          `${benchmarkRoot}/concurrent/target-${index}.bin`,
          concurrentPayload
        )
      )
    )
  );
  const concurrentRead = await milliseconds(() =>
    Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        readAndVerify(
          `${benchmarkRoot}/concurrent/target-${index}.bin`,
          concurrentPayload.byteLength,
          0xa5
        )
      )
    )
  );
  if (
    concurrentRead.value.some((size) => size !== concurrentPayload.byteLength)
  ) {
    throw new Error("Concurrent read returned the wrong file size");
  }

  progress("executable bit");
  const executablePath = `${benchmarkRoot}/write/executable-bit.sh`;
  let executableBitVerified = false;
  const executableBit = await milliseconds(async () => {
    await writeFile(
      executablePath,
      "#!/bin/sh\nprintf 'dust-executable-ok\\n'\n"
    );
    await chmod(executablePath, 0o666);
    try {
      await execFile(executablePath);
      throw new Error("A file without an executable bit was executed");
    } catch (error) {
      if (!isAccessDenied(error)) {
        throw error;
      }
    }
    await chmod(executablePath, 0o777);
    try {
      const result = await execFile(executablePath);
      if (result.stdout !== "dust-executable-ok\n") {
        throw new Error("Executable file returned unexpected output");
      }
      executableBitVerified = true;
    } catch (error) {
      // gcsfuse does not store chmod changes. Keep that result in the
      // comparison, but require executable bits to work on the Dust mount.
      if (label === "dust-database-fuse" || !isAccessDenied(error)) {
        throw error;
      }
    }
    await unlink(executablePath);
  });

  sampling = false;
  clearInterval(sampler);
  const finalProcesses = await sampleFilesystemProcesses();

  const summarize = (values: number[]) => ({
    samplesMs: values,
    p50Ms: median(values),
  });
  const summarizeBySize = (values: Record<string, number[]>) =>
    Object.fromEntries(
      Object.entries(values).map(([size, samples]) => [
        size,
        summarize(samples),
      ])
    );

  process.stdout.write(
    `${JSON.stringify({
      label,
      coldRead: summarizeBySize(coldReads),
      warmRead: summarizeBySize(warmReads),
      stat: summarize(statTimes),
      readdir20: summarize(readdirTimes),
      writeFsync: summarizeBySize(writeFsync),
      create: summarize(createTimes),
      rename: summarize(renameTimes),
      unlink: summarize(unlinkTimes),
      crossConversationToPod: {
        ...summarize(crossMoveTimes),
        nativeMoves: crossMoveTimes.length - crossMountFallbacks,
        copyDeleteFallbacks: crossMountFallbacks,
      },
      concurrentEightByOneMiB: {
        writeFsyncMs: concurrent.elapsedMs,
        readVerifyMs: concurrentRead.elapsedMs,
      },
      executableBit: {
        verified: executableBitVerified,
        elapsedMs: executableBit.elapsedMs,
      },
      filesystemProcesses: {
        count: finalProcesses.processes,
        cpuTicks: finalProcesses.cpuTicks - initialProcesses.cpuTicks,
        initialRssBytes: initialProcesses.rssBytes,
        finalRssBytes: finalProcesses.rssBytes,
        peakRssBytes,
      },
    })}\n`
  );
}

await main();
