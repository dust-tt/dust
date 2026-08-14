import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DSBX_PATH_ENV,
  runWithInvocationEnv,
  TOOLS_API_URL_ENV,
  TOOLS_SANDBOX_TOKEN_ENV,
  ToolCallError,
  ToolCallResult,
  tools,
} from "@dust/pod";

const BASE_URL = "https://front.test/api/v1/w/w_test";
const TOKEN = "sandbox-token";

/**
 * A fake dsbx executable: a shell script that records its argv, stdin, and
 * the credentials it received, then plays back the scenario files sitting
 * next to it (stdout, stderr, exit_code, sleep_seconds). Each test gets a
 * fresh temp dir so scenarios and recordings never bleed across tests.
 */
interface FakeDsbx {
  readonly dir: string;
  readonly path: string;
}

function makeFakeDsbx({
  stdout,
  stderr,
  exitCode,
  sleepSeconds,
}: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  sleepSeconds?: number;
} = {}): FakeDsbx {
  const dir = mkdtempSync(join(tmpdir(), "fake-dsbx-"));
  const path = join(dir, "dsbx");
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'dir="$(dirname "$0")"',
      'printf \'%s\\n\' "$@" > "$dir/argv"',
      'cat > "$dir/stdin"',
      'printf \'%s\' "$DUST_API_URL" > "$dir/env_api_url"',
      'printf \'%s\' "$DUST_SANDBOX_TOKEN" > "$dir/env_token"',
      'if [ -f "$dir/sleep_seconds" ]; then sleep "$(cat "$dir/sleep_seconds")"; fi',
      'if [ -f "$dir/stderr" ]; then cat "$dir/stderr" >&2; fi',
      'if [ -f "$dir/stdout" ]; then cat "$dir/stdout"; fi',
      'if [ -f "$dir/exit_code" ]; then exit "$(cat "$dir/exit_code")"; fi',
      "exit 0",
    ].join("\n"),
    { mode: 0o755 }
  );
  chmodSync(path, 0o755);
  if (stdout !== undefined) {
    writeFileSync(join(dir, "stdout"), stdout);
  }
  if (stderr !== undefined) {
    writeFileSync(join(dir, "stderr"), stderr);
  }
  if (exitCode !== undefined) {
    writeFileSync(join(dir, "exit_code"), String(exitCode));
  }
  if (sleepSeconds !== undefined) {
    writeFileSync(join(dir, "sleep_seconds"), String(sleepSeconds));
  }
  return { dir, path };
}

function recorded(fake: FakeDsbx, name: string): string {
  return readFileSync(join(fake.dir, name), "utf8");
}

function resultJson(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    content: [{ type: "text", text: "3 results" }],
    isError: false,
    ...overrides,
  });
}

function envelopeJson(error: Record<string, unknown>): string {
  return JSON.stringify({ error });
}

/** Run tools.call inside an invocation context wired to the fake binary. */
function callThroughFake(
  fake: FakeDsbx,
  {
    server = "slack",
    tool = "search",
    args,
    timeoutMs,
    env,
  }: {
    server?: string;
    tool?: string;
    args?: Record<string, unknown>;
    timeoutMs?: number;
    env?: Record<string, string>;
  } = {}
): Promise<ToolCallResult> {
  return runWithInvocationEnv(
    env ?? {
      [TOOLS_API_URL_ENV]: BASE_URL,
      [TOOLS_SANDBOX_TOKEN_ENV]: TOKEN,
      [DSBX_PATH_ENV]: fake.path,
    },
    () =>
      tools.call(
        server,
        tool,
        args,
        timeoutMs === undefined ? undefined : { timeoutMs }
      )
  );
}

async function expectToolCallError(
  promise: Promise<unknown>
): Promise<ToolCallError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ToolCallError);
    if (err instanceof ToolCallError) {
      return err;
    }
  }
  throw new Error("expected the call to throw a ToolCallError");
}

describe("tools.call", () => {
  test("spawns dsbx with the delegation argv and returns the parsed result", async () => {
    const fake = makeFakeDsbx({ stdout: resultJson() });
    const result = await callThroughFake(fake, {
      args: { query: "budget", count: 2, filter: { status: "active" } },
    });

    expect(result.isError).toBe(false);
    expect(result.text()).toBe("3 results");
    expect(recorded(fake, "argv")).toBe(
      "tools\n--json\n--args-json\n-\nslack\nsearch\n"
    );
    // Args travel over stdin as one verbatim JSON object: no argv limits, no
    // scalar coercion.
    expect(JSON.parse(recorded(fake, "stdin"))).toEqual({
      query: "budget",
      count: 2,
      filter: { status: "active" },
    });
    expect(recorded(fake, "env_api_url")).toBe(BASE_URL);
    expect(recorded(fake, "env_token")).toBe(TOKEN);
  });

  test("omitted args are sent as an empty JSON object", async () => {
    const fake = makeFakeDsbx({ stdout: resultJson() });
    await callThroughFake(fake);
    expect(recorded(fake, "stdin")).toBe("{}");
  });

  test("a tool-level error resolves with isError true instead of throwing", async () => {
    // dsbx exits 1 when the tool reported an error, with the result payload
    // still on stdout.
    const fake = makeFakeDsbx({
      stdout: resultJson({
        content: [{ type: "text", text: "tool exploded" }],
        isError: true,
      }),
      exitCode: 1,
    });
    const result = await callThroughFake(fake);
    expect(result.isError).toBe(true);
    expect(result.text()).toBe("tool exploded");
  });

  test("passes structuredContent through when the platform delivers one", async () => {
    const fake = makeFakeDsbx({
      stdout: resultJson({ structuredContent: { rows: [1, 2] } }),
    });
    const result = await callThroughFake(fake);
    expect(result.structuredContent).toEqual({ rows: [1, 2] });
    expect(result.json()).toEqual({ rows: [1, 2] });
  });
});

describe("environment handling", () => {
  test("throws missing_env without DUST_API_URL", async () => {
    const fake = makeFakeDsbx({ stdout: resultJson() });
    const error = await expectToolCallError(
      callThroughFake(fake, {
        env: { [TOOLS_SANDBOX_TOKEN_ENV]: TOKEN, [DSBX_PATH_ENV]: fake.path },
      })
    );
    expect(error.code).toBe("missing_env");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain(TOOLS_API_URL_ENV);
  });

  test("throws missing_env without DUST_SANDBOX_TOKEN", async () => {
    const fake = makeFakeDsbx({ stdout: resultJson() });
    const error = await expectToolCallError(
      callThroughFake(fake, {
        env: { [TOOLS_API_URL_ENV]: BASE_URL, [DSBX_PATH_ENV]: fake.path },
      })
    );
    expect(error.code).toBe("missing_env");
    expect(error.message).toContain(TOOLS_SANDBOX_TOKEN_ENV);
  });

  test("the child gets the invocation's credentials, not process.env's", async () => {
    // In a resident worker one process serves concurrent invocations;
    // process.env may carry another (scrubbed or stale) token. The spawn env
    // must carry the invocation context's values.
    const processToken = process.env[TOOLS_SANDBOX_TOKEN_ENV];
    process.env[TOOLS_SANDBOX_TOKEN_ENV] = "process-env-token";
    try {
      const fake = makeFakeDsbx({ stdout: resultJson() });
      await callThroughFake(fake, {
        env: {
          [TOOLS_API_URL_ENV]: BASE_URL,
          [TOOLS_SANDBOX_TOKEN_ENV]: "invocation-token",
          [DSBX_PATH_ENV]: fake.path,
        },
      });
      expect(recorded(fake, "env_token")).toBe("invocation-token");
    } finally {
      if (processToken === undefined) {
        delete process.env[TOOLS_SANDBOX_TOKEN_ENV];
      } else {
        process.env[TOOLS_SANDBOX_TOKEN_ENV] = processToken;
      }
    }
  });
});

describe("error envelope classification", () => {
  test("a typed envelope surfaces code, message, retryable, and status", async () => {
    const fake = makeFakeDsbx({
      stdout: envelopeJson({
        code: "fast_function_called_tools",
        message:
          "This Pod function is published as fast and cannot call tools.",
        retryable: false,
        status: 403,
      }),
      exitCode: 12,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("fast_function_called_tools");
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(403);
    expect(error.message).toContain("published as fast");
  });

  test("rate_limited stays retryable", async () => {
    const fake = makeFakeDsbx({
      stdout: envelopeJson({
        code: "rate_limited",
        message: "Too many requests.",
        retryable: true,
        status: 429,
      }),
      exitCode: 13,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("rate_limited");
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(429);
  });

  test("tool_output_unavailable carries no status and stays retryable", async () => {
    const fake = makeFakeDsbx({
      stdout: envelopeJson({
        code: "tool_output_unavailable",
        message: "offloaded tool output never became readable",
        retryable: true,
      }),
      exitCode: 15,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("tool_output_unavailable");
    expect(error.retryable).toBe(true);
    expect(error.status).toBeUndefined();
  });

  test("an envelope code this client does not know degrades to unknown", async () => {
    // The envelope contract is append-only: a newer dsbx may emit codes this
    // client has never heard of. Message and retryable flag still carry.
    const fake = makeFakeDsbx({
      stdout: envelopeJson({
        code: "code_from_the_future",
        message: "something new",
        retryable: true,
      }),
      exitCode: 10,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("unknown");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("something new");
  });

  test("dsbx-side validation failures arrive as unknown with the message", async () => {
    // e.g. a typo'd server name: dsbx bails before any tool call and emits
    // the generic envelope.
    const fake = makeFakeDsbx({
      stdout: envelopeJson({
        code: "unknown",
        message: "server 'slak' not found",
        retryable: false,
      }),
      exitCode: 1,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("unknown");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("server 'slak' not found");
  });
});

describe("process failures", () => {
  test("an unparseable stdout on exit 0 is invalid_response", async () => {
    const fake = makeFakeDsbx({ stdout: "not json at all" });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("invalid_response");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("not json at all");
  });

  test("a non-zero exit without an envelope is exec_error with the stderr tail", async () => {
    // e.g. a clap usage error (exit 2): stderr prose, no stdout contract.
    const fake = makeFakeDsbx({
      stderr: "error: unexpected argument",
      exitCode: 2,
    });
    const error = await expectToolCallError(callThroughFake(fake));
    expect(error.code).toBe("exec_error");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("exited 2");
    expect(error.message).toContain("unexpected argument");
  });

  test("a missing dsbx binary is exec_error naming the path", async () => {
    const error = await expectToolCallError(
      runWithInvocationEnv(
        {
          [TOOLS_API_URL_ENV]: BASE_URL,
          [TOOLS_SANDBOX_TOKEN_ENV]: TOKEN,
          [DSBX_PATH_ENV]: "/nonexistent/dsbx-test-12345",
        },
        () => tools.call("slack", "search", {})
      )
    );
    expect(error.code).toBe("exec_error");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("/nonexistent/dsbx-test-12345");
  });

  test("kills the child and throws timeout past timeoutMs", async () => {
    const fake = makeFakeDsbx({ stdout: resultJson(), sleepSeconds: 30 });
    const error = await expectToolCallError(
      callThroughFake(fake, { timeoutMs: 150 })
    );
    expect(error.code).toBe("timeout");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("slack.search");
  });
});

describe("ToolCallResult helpers", () => {
  test("text() concatenates text blocks and text resources", () => {
    const result = new ToolCallResult({
      content: [
        { type: "text", text: "first" },
        { type: "image", data: "...", mimeType: "image/png" },
        { type: "resource", resource: { uri: "u", text: "second" } },
        { type: "resource", resource: { uri: "u", blob: "..." } },
        "not a block",
      ],
      isError: false,
    });
    expect(result.text()).toBe("first\nsecond");
  });

  test("json() parses the concatenated text", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: '{"results": [1, 2], "paging": null}' }],
      isError: false,
    });
    expect(result.json()).toEqual({ results: [1, 2], paging: null });
  });

  test("json() throws on non-JSON text", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: "3 results found" }],
      isError: false,
    });
    expect(() => result.json()).toThrow(SyntaxError);
  });

  test("json() prefers structuredContent when present", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: "human summary" }],
      isError: false,
      structuredContent: { ok: true },
    });
    expect(result.json()).toEqual({ ok: true });
  });
});
