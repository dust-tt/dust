/**
 * dust-tools is a single CLI entrypoint for sandbox profile file/search tools.
 *
 * The caller selects a provider profile with `--profile <anthropic|openai|gemini>`,
 * then invokes a subcommand whose argument contract may vary slightly by profile.
 * The shell profile wrappers stay thin and dispatch into this binary.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { getProfile } from "./profile";
import { isToolError, printToolError } from "./shared/errors";
import * as editFile from "./tools/edit_file";
import * as glob from "./tools/glob";
import * as grepFiles from "./tools/grep_files";
import * as listDir from "./tools/list_dir";
import * as readFile from "./tools/read_file";
import * as shell from "./tools/shell";
import * as writeFile from "./tools/write_file";

type ToolModule = {
  readonly help: string;
  run(
    args: readonly string[],
    profile: ReturnType<typeof getProfile>
  ): Promise<void>;
};

const TOOLS: Record<string, ToolModule> = {
  edit_file: editFile,
  glob,
  grep_files: grepFiles,
  list_dir: listDir,
  read_file: readFile,
  shell,
  write_file: writeFile,
};

function printGlobalUsage(stream: NodeJS.WriteStream): void {
  stream.write("Usage: dust-tools [--profile NAME] <tool> [args...]\n");
  stream.write(`Available tools: ${Object.keys(TOOLS).sort().join(", ")}\n`);
}

let pipeHandlersInstalled = false;

function installPipeHandlers(): void {
  if (pipeHandlersInstalled) {
    return;
  }

  const handlePipeError = (err: NodeJS.ErrnoException): void => {
    if (err.code === "EPIPE") {
      process.exit(0);
    }
    throw err;
  };

  process.stdout.on("error", handlePipeError);
  process.stderr.on("error", handlePipeError);
  pipeHandlersInstalled = true;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  installPipeHandlers();

  let profileArg: string | undefined;
  let index = 0;

  if (argv[index] === "--profile") {
    profileArg = argv[index + 1];
    if (profileArg === undefined) {
      process.stderr.write("Error: --profile requires a value\n");
      return 1;
    }
    index += 2;
  }

  const remaining = argv.slice(index);
  if (
    remaining.length === 0 ||
    (remaining.length === 1 && ["--help", "-h"].includes(remaining[0] ?? ""))
  ) {
    printGlobalUsage(process.stderr);
    if (remaining.length === 0) {
      return 1;
    }
    return 0;
  }

  const toolName = remaining[0] ?? "";
  const toolArgs = remaining.slice(1);
  const tool = TOOLS[toolName];

  if (!tool) {
    process.stderr.write(`Error: unknown tool: ${toolName}\n`);
    printGlobalUsage(process.stderr);
    return 1;
  }

  try {
    await tool.run(toolArgs, getProfile(profileArg));
    return 0;
  } catch (err: unknown) {
    if (isToolError(err)) {
      printToolError(err);
      return err.exitCode;
    }

    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }
}

const entrypointPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypointPath === invokedPath) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exit(exitCode);
  });
}
