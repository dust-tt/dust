import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { Profile } from "../profile";
import { parseIntArg, usageError, wantsHelp } from "../shared/args";

const SHELL_USAGE = "shell <command> [timeout_sec]";

const DEFAULT_TIMEOUT_SECONDS = 60;
const OUTPUT_BUDGET_CHARS = 50_000;
const STDERR_MIN_CHARS = 1_000;
const TIMEOUT_EXIT_CODE = 124;
const TIMEOUT_KILLED_EXIT_CODE = 137;
const MAX_BUFFER_BYTES = 500 * 1024 * 1024;

// GNU `timeout` puts the command in its own process group and signals the
// whole group, so background jobs and parallel fan-outs die with the command
// instead of outliving it. `spawnSync`'s own timeout only signals the direct
// child, which shares this process' group. Never pass `--foreground`: it
// disables the group kill, which is the entire point.
//
// Always present in the sandbox image (coreutils). The candidate list and the
// fallback below only matter when the tests drive dust-tools on a host that
// lacks it, such as macOS; there the group kill is not enforced.
const TIMEOUT_BIN_CANDIDATES = [
  "/usr/bin/timeout",
  "/usr/local/bin/gtimeout",
  "/opt/homebrew/bin/gtimeout",
];
const TIMEOUT_KILL_GRACE_SECONDS = 5;
// `spawnSync`'s timeout is only a backstop for a wedged `timeout`. It must
// stay strictly later than the SIGKILL escalation or it kills `timeout` before
// it can signal the group, and the group leaks.
const TIMEOUT_BACKSTOP_BUFFER_MS = 5_000;

function findTimeoutBin(): string | null {
  return TIMEOUT_BIN_CANDIDATES.find((bin) => fs.existsSync(bin)) ?? null;
}

export const help = `shell - Execute shell command with strategic output truncation

Usage: ${SHELL_USAGE}

Arguments:
  command      Shell command to execute (required)
  timeout_sec  Timeout in seconds, default: ${DEFAULT_TIMEOUT_SECONDS} (optional)

Output budget: ${OUTPUT_BUDGET_CHARS} chars split across stdout and stderr.
  stdout is served first; stderr keeps a minimum of ${STDERR_MIN_CHARS} chars
  when it has content. When truncated, the tail is shown and the full stream
  is saved to /tmp/shell_output_<nanos>.<stream>.txt.

Examples:
  shell "ls -la"                    # Simple command
  shell "python script.py" 120      # Run with 2 minute timeout`;

interface AllocatedOutput {
  readonly text: string;
  readonly fullSize: number;
  readonly truncated: boolean;
}

function tail(text: string, budgetChars: number): AllocatedOutput {
  if (text.length <= budgetChars) {
    return { text, fullSize: text.length, truncated: false };
  }
  return {
    text: text.slice(text.length - budgetChars),
    fullSize: text.length,
    truncated: true,
  };
}

function allocate(
  stdout: string,
  stderr: string
): {
  stdout: AllocatedOutput;
  stderr: AllocatedOutput;
} {
  const stderrReserve = Math.min(STDERR_MIN_CHARS, stderr.length);
  const stdoutBudget = OUTPUT_BUDGET_CHARS - stderrReserve;
  const stdoutAlloc = tail(stdout, stdoutBudget);

  const stderrBudget = OUTPUT_BUDGET_CHARS - stdoutAlloc.text.length;
  const stderrAlloc = tail(stderr, stderrBudget);

  return { stdout: stdoutAlloc, stderr: stderrAlloc };
}

function dumpFullOutput(stream: "stdout" | "stderr", content: string): string {
  const nanos = process.hrtime.bigint().toString();
  const dumpPath = path.join("/tmp", `shell_output_${nanos}.${stream}.txt`);
  fs.writeFileSync(dumpPath, content, "utf8");
  return dumpPath;
}

function emit(
  channel: NodeJS.WriteStream,
  stream: "stdout" | "stderr",
  full: string,
  alloc: AllocatedOutput
): void {
  if (!alloc.truncated) {
    if (alloc.text.length > 0) {
      channel.write(alloc.text);
    }
    return;
  }

  const dumpPath = dumpFullOutput(stream, full);
  channel.write(
    `[Output too long (${alloc.fullSize} chars). Showing last ${alloc.text.length} chars. Full: ${dumpPath}]\n`
  );
  channel.write("[BEGIN TAIL]\n");
  if (alloc.text.length > 0) {
    channel.write(alloc.text);
    if (!alloc.text.endsWith("\n")) {
      channel.write("\n");
    }
  }
  channel.write("[END TAIL]\n");
}

export async function run(
  args: readonly string[],
  _profile: Profile
): Promise<number> {
  if (wantsHelp(args)) {
    process.stdout.write(`${help}\n`);
    return 0;
  }

  if (args.length === 0) {
    usageError("command is required", SHELL_USAGE);
  }

  const cmd = args[0] ?? "";
  const timeoutSec =
    args[1] !== undefined
      ? parseIntArg(args[1], "timeout_sec", { minimum: 1 })
      : DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = timeoutSec * 1000;

  const timeoutBin = findTimeoutBin();
  const spawnTarget =
    timeoutBin !== null
      ? {
          file: timeoutBin,
          args: [
            "-k",
            String(TIMEOUT_KILL_GRACE_SECONDS),
            String(timeoutSec),
            "bash",
            "-c",
            cmd,
          ],
          backstopMs:
            timeoutMs +
            TIMEOUT_KILL_GRACE_SECONDS * 1000 +
            TIMEOUT_BACKSTOP_BUFFER_MS,
        }
      : { file: "bash", args: ["-c", cmd], backstopMs: timeoutMs };

  const startedAtMs = Date.now();
  const result = spawnSync(spawnTarget.file, spawnTarget.args, {
    encoding: "utf8",
    timeout: spawnTarget.backstopMs,
    killSignal: "SIGTERM",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const elapsedMs = Date.now() - startedAtMs;

  const stdoutRaw = result.stdout ?? "";
  let stderrRaw = result.stderr ?? "";

  const errorCode =
    result.error && "code" in result.error ? result.error.code : undefined;
  // 137 is also what an OOM kill looks like, so only read it as a timeout when
  // the command actually reached its deadline.
  const timedOut =
    errorCode === "ETIMEDOUT" ||
    result.status === TIMEOUT_EXIT_CODE ||
    (result.status === TIMEOUT_KILLED_EXIT_CODE && elapsedMs >= timeoutMs);
  const bufferOverflowed = errorCode === "ENOBUFS";
  if (timedOut) {
    const separator =
      stderrRaw.length > 0 && !stderrRaw.endsWith("\n") ? "\n" : "";
    stderrRaw = `${stderrRaw}${separator}[Command timed out after ${timeoutSec}s]\n`;
  } else if (bufferOverflowed) {
    const separator =
      stderrRaw.length > 0 && !stderrRaw.endsWith("\n") ? "\n" : "";
    stderrRaw = `${stderrRaw}${separator}[Command output exceeded ${MAX_BUFFER_BYTES} bytes per stream and was terminated]\n`;
  }

  const allocated = allocate(stdoutRaw, stderrRaw);
  emit(process.stdout, "stdout", stdoutRaw, allocated.stdout);
  emit(process.stderr, "stderr", stderrRaw, allocated.stderr);

  let exitCode: number;
  if (timedOut) {
    exitCode = TIMEOUT_EXIT_CODE;
  } else if (bufferOverflowed) {
    exitCode = 1;
  } else if (typeof result.status === "number") {
    exitCode = result.status;
  } else {
    exitCode = 1;
  }

  return exitCode;
}
