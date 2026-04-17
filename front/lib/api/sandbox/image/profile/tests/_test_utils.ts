import { spawnSync } from "child_process";
import * as fs from "fs";
import { createRequire } from "module";
import * as os from "os";
import * as path from "path";

import { runCli } from "../src/index";

export const PROFILE_LOCAL_DIR = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const tsxPackagePath = require.resolve("tsx/package.json");
const tsxPackage = require(tsxPackagePath) as { bin: string };
const tsxCliPath = path.resolve(path.dirname(tsxPackagePath), tsxPackage.bin);

export function runBashFunction(
  funcCall: string,
  cwd: string,
  profile: "anthropic" | "openai" | "gemini" = "anthropic"
): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const profilePath = path.join(PROFILE_LOCAL_DIR, `${profile}.sh`);
  const dustToolsCommand = `${process.execPath} ${tsxCliPath} ${path.join(
    PROFILE_LOCAL_DIR,
    "src",
    "index.ts"
  )}`;
  const result = spawnSync(
    "bash",
    ["--norc", "-c", `source "${profilePath}" && ${funcCall}`],
    {
      cwd,
      encoding: "utf-8",
      env: {
        ...process.env,
        DUST_TOOLS_CMD: dustToolsCommand,
      },
      timeout: 10000,
    }
  );
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    exitCode: result.status ?? 1,
  };
}

function collectWrite(
  chunk: string | Uint8Array,
  encoding?: BufferEncoding
): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  return Buffer.from(chunk).toString(encoding ?? "utf8");
}

export async function runTool(
  tool: string,
  args: readonly string[],
  profile: "anthropic" | "openai" | "gemini" = "anthropic"
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk, encoding, callback) => {
    stdoutChunks.push(
      collectWrite(chunk, typeof encoding === "string" ? encoding : undefined)
    );

    if (typeof encoding === "function") {
      encoding();
    }
    if (typeof callback === "function") {
      callback();
    }

    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk, encoding, callback) => {
    stderrChunks.push(
      collectWrite(chunk, typeof encoding === "string" ? encoding : undefined)
    );

    if (typeof encoding === "function") {
      encoding();
    }
    if (typeof callback === "function") {
      callback();
    }

    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCli(["--profile", profile, tool, ...args]);

    return {
      stdout: stdoutChunks.join("").trim(),
      stderr: stderrChunks.join("").trim(),
      exitCode,
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "profile-test-"));
}

export function cleanupTempDir(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
