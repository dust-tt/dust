import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { wrapCommand, wrapCommandWithCapture } from "./profile";

interface ExecResult {
  code: number;
  stderr: string;
  stdout: string;
}

let execCounter = 0;

function nextExecId(): string {
  execCounter += 1;
  return `profile-exec-${process.pid}-${execCounter}`;
}

function stripProfileSource(wrapped: string): string {
  const stripped = wrapped.replace(/^source \S+ && /m, "");

  if (stripped === wrapped) {
    throw new Error("Expected wrapped command to contain a source prefix.");
  }

  return stripped;
}

function execWrapped(wrapped: string): ExecResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-exec-test-"));
  const scriptPath = path.join(tempDir, "wrapped.sh");
  const script = [
    `shell() { bash -c "$1"; }`,
    stripProfileSource(wrapped),
  ].join("\n");

  try {
    fs.writeFileSync(scriptPath, script);
    const result = spawnSync("bash", ["--norc", scriptPath], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 10000,
    });

    if (result.error) {
      throw result.error;
    }

    return {
      code: result.status ?? 1,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function execWrapCommand(cmd: string): ExecResult {
  return execWrapped(wrapCommand(cmd, "anthropic"));
}

function execWrapCommandWithCapture(cmd: string): ExecResult {
  const execId = nextExecId();

  try {
    return execWrapped(wrapCommandWithCapture(cmd, execId, "anthropic"));
  } finally {
    fs.rmSync(`/tmp/dust_exec_${execId}.out`, { force: true });
    fs.rmSync(`/tmp/dust_exec_${execId}.exit`, { force: true });
  }
}

const shellExpansionCases = [
  {
    cmd: `MY_VAR="hello world"\necho "$MY_VAR"`,
    name: "variable assignment and reference",
    stdout: "hello world\n",
  },
  {
    cmd: `MY_VAR=inner\necho "$(echo "$MY_VAR")"`,
    name: "command substitution",
    stdout: "inner\n",
  },
  {
    cmd: 'MY_VAR=inner\necho `echo "$MY_VAR"`',
    name: "backtick command substitution",
    stdout: "inner\n",
  },
  {
    cmd: `MESSAGE='hello "world"'\necho "$MESSAGE"`,
    name: "nested quotes",
    stdout: `hello "world"\n`,
  },
  {
    cmd: `FIRST=hello\nSECOND=world\necho "$FIRST $SECOND"`,
    name: "multi-line command",
    stdout: "hello world\n",
  },
  {
    cmd: `echo '$NOT_EXPANDED'`,
    name: "literal dollar in single quotes",
    stdout: "$NOT_EXPANDED\n",
  },
  {
    cmd: `cat <<'EOF'\n$NOT_EXPANDED\nEOF`,
    name: "single-quoted heredoc in user command",
    stdout: "$NOT_EXPANDED\n",
  },
];

describe.each([
  { exec: execWrapCommand, name: "wrapCommand" },
  { exec: execWrapCommandWithCapture, name: "wrapCommandWithCapture" },
])("$name execution", ({ exec }) => {
  it.each(shellExpansionCases)("preserves $name", ({ cmd, stdout }) => {
    const result = exec(cmd);

    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout,
    });
  });
});

describe("reserved heredoc delimiter", () => {
  it("throws when wrapCommand receives the delimiter on its own line", () => {
    expect(() =>
      wrapCommand("echo before\nDUST_CMD_EOF\necho after", "anthropic")
    ).toThrow(
      "Command contains the reserved heredoc delimiter 'DUST_CMD_EOF'."
    );
  });

  it("throws when wrapCommandWithCapture receives the delimiter on its own line", () => {
    expect(() =>
      wrapCommandWithCapture(
        "echo before\nDUST_CMD_EOF\necho after",
        "exec-id",
        "anthropic"
      )
    ).toThrow(
      "Command contains the reserved heredoc delimiter 'DUST_CMD_EOF'."
    );
  });
});
