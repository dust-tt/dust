import {
  normalizeSandboxFunctionResult,
  SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION,
} from "@app/lib/api/sandbox_functions/result_envelope";
import { describe, expect, it } from "vitest";

describe("normalizeSandboxFunctionResult", () => {
  it("accepts a protocol v3 success envelope", () => {
    // Keep the literal stable: bumping SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION
    // must fail this pin until the wire shape and dsbx emitter move together.
    const envelope = {
      protocolVersion: 3,
      delivery: "stdout",
      outcome: { ok: true, output: { hello: "world" } },
      timingsMs: { total: 12, runner: 8, importBundle: 3 },
      futureField: "ignored",
    };

    expect(SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION).toBe(3);
    expect(normalizeSandboxFunctionResult(envelope)).toEqual({
      ok: true,
      output: { hello: "world" },
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

  it("preserves the large-output error codes from a protocol v3 failure envelope", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: {
          ok: false,
          error: {
            code: "output_truncated",
            message:
              "function output was truncated in transit (read 2097152 bytes, runner exit 0); " +
              "return a smaller payload or write large data to a pod file",
          },
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "output_truncated",
        message:
          "function output was truncated in transit (read 2097152 bytes, runner exit 0); " +
          "return a smaller payload or write large data to a pod file",
      },
    });

    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: {
          ok: false,
          error: {
            code: "output_too_large",
            message:
              "function result is 6291456 bytes, over the 5242880-byte limit; " +
              "store large data in a pod file or database and return a pointer to it",
          },
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "output_too_large",
        message:
          "function result is 6291456 bytes, over the 5242880-byte limit; " +
          "store large data in a pod file or database and return a pointer to it",
      },
    });
  });

  it("accepts dsbx-minted invocation_failed codes in a protocol v3 outcome", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: {
          ok: false,
          error: {
            code: "invocation_failed",
            message: "function produced no output",
          },
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invocation_failed",
        message: "function produced no output",
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

  it("rejects a non-integer protocol version without falling through to legacy parsers", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3.5,
        delivery: "stdout",
        outcome: { ok: true, output: 1 },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Sandbox function returned an invalid result envelope.",
      },
    });
  });

  it("ignores timingsMs until a consumer reads it", () => {
    expect(
      normalizeSandboxFunctionResult({
        protocolVersion: 3,
        delivery: "stdout",
        outcome: { ok: true, output: 1 },
        timingsMs: { total: -1, "bad-key!": 1 },
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
