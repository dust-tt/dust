import {
  normalizeSandboxFunctionResult,
  SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION,
} from "@app/lib/api/sandbox_functions/result_envelope";
import { describe, expect, it } from "vitest";

describe("normalizeSandboxFunctionResult", () => {
  it("accepts a protocol v3 success envelope", () => {
    // Cross-language pin for the Rust ResultEnvelope serde shape added with
    // `--result-delivery stdout` (Workstream 1 CLI PR). Keep the literal stable.
    const envelope = {
      protocolVersion: SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION,
      delivery: "stdout",
      outcome: { ok: true, output: { hello: "world" } },
      timingsMs: { total: 12, runner: 8, importBundle: 3 },
      futureField: "ignored",
    };

    expect(normalizeSandboxFunctionResult(envelope)).toEqual({
      ok: true,
      output: { hello: "world" },
      timingsMs: { total: 12, runner: 8, importBundle: 3 },
    });
  });

  it("preserves the runner error code from a protocol v3 failure envelope", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "callback",
        outcome: {
          ok: false,
          error: {
            code: "invalid_output",
            message: "Function output does not match schema.output.",
          },
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_output",
        message: "Function output does not match schema.output.",
      },
    });
  });

  it("fails a protocol v3 envelope with a malformed outcome", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: { ok: true },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Sandbox function returned an invalid result envelope.",
      },
    });
  });

  it("rejects an unsupported protocol version without falling through to legacy parsers", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 4,
        delivery: "stdout",
        outcome: { ok: true, output: { hello: "world" } },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Unsupported Pod function result protocol version 4.",
      },
    });
  });

  it("drops invalid timingsMs without failing the outcome", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: { ok: true, output: 1 },
        timingsMs: { total: -1 },
      })
    ).toEqual({
      ok: true,
      output: 1,
    });
  });

  it("drops timingsMs with unbounded or invalid keys", () => {
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => [`phase${i}`, i])
    );
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: { ok: true, output: 1 },
        timingsMs: tooManyKeys,
      })
    ).toEqual({
      ok: true,
      output: 1,
    });

    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "spool",
        outcome: { ok: true, output: 1 },
        timingsMs: { "bad-key!": 1 },
      })
    ).toEqual({
      ok: true,
      output: 1,
    });
  });

  it("accepts the current runner success and failure envelopes", () => {
    expect(
      normalizeSandboxFunctionResult({ ok: true, output: { hello: "world" } })
    ).toEqual({ ok: true, output: { hello: "world" } });

    expect(
      normalizeSandboxFunctionResult({
        ok: false,
        error: {
          code: "http_error",
          message: "Function returned HTTP 502.",
          status: 502,
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "http_error",
        message: "Function returned HTTP 502.",
        status: 502,
      },
    });
  });

  it("normalizes successful callbacks from the previous runner image", () => {
    expect(
      normalizeSandboxFunctionResult({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(JSON.stringify({ hello: "legacy" })).toString(
            "base64"
          ),
          encoding: "base64",
        },
      })
    ).toEqual({ ok: true, output: { hello: "legacy" } });
  });

  it("normalizes non-2xx and threw errors from the previous runner image", () => {
    expect(
      normalizeSandboxFunctionResult({
        ok: true,
        response: {
          status: 500,
          headers: {},
          body: Buffer.from("boom").toString("base64"),
          encoding: "base64",
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "http_error",
        message: "Function returned HTTP 500: boom",
        status: 500,
      },
    });

    expect(
      normalizeSandboxFunctionResult({
        ok: false,
        error: { kind: "threw", message: "boom" },
      })
    ).toEqual({
      ok: false,
      error: { code: "threw", message: "boom" },
    });
  });

  it("fails malformed envelopes with the stable invalid-envelope message", () => {
    for (const result of [null, {}, { ok: true }]) {
      expect(normalizeSandboxFunctionResult(result)).toEqual({
        ok: false,
        error: {
          code: "invocation_failed",
          message: "Sandbox function returned an invalid result envelope.",
        },
      });
    }
  });
});
