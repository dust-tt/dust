import { parseStdoutResultEnvelope } from "@app/lib/api/sandbox_functions/result_delivery";
import { describe, expect, it } from "vitest";

describe("parseStdoutResultEnvelope", () => {
  it("parses the last non-empty stdout line as a v3 envelope", () => {
    expect(
      parseStdoutResultEnvelope(
        "noise\n" +
          JSON.stringify({
            protocolVersion: 3,
            delivery: "stdout",
            outcome: { ok: true, output: { hello: "world" } },
          }) +
          "\n"
      )
    ).toEqual({
      outcome: { ok: true, output: { hello: "world" } },
      timings: null,
    });
  });

  it("extracts the runner kind from the envelope timings in the same parse", () => {
    expect(
      parseStdoutResultEnvelope(
        JSON.stringify({
          protocolVersion: 3,
          delivery: "stdout",
          outcome: { ok: true, output: 1 },
          timingsMs: { total: 12, runner: 8, runnerKind: "warm" },
        })
      )
    ).toEqual({
      outcome: { ok: true, output: 1 },
      timings: { runnerKind: "warm" },
    });
  });

  it("preserves runner ok:false codes", () => {
    expect(
      parseStdoutResultEnvelope(
        JSON.stringify({
          protocolVersion: 3,
          delivery: "stdout",
          outcome: {
            ok: false,
            error: { code: "threw", message: "boom" },
          },
        })
      )
    ).toEqual({
      outcome: { ok: false, error: { code: "threw", message: "boom" } },
      timings: null,
    });
  });

  it("preserves the output_truncated code dsbx mints for a cut envelope", () => {
    expect(
      parseStdoutResultEnvelope(
        JSON.stringify({
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
      )
    ).toEqual({
      outcome: {
        ok: false,
        error: {
          code: "output_truncated",
          message:
            "function output was truncated in transit (read 2097152 bytes, runner exit 0); " +
            "return a smaller payload or write large data to a pod file",
        },
      },
      timings: null,
    });
  });

  it("returns invocation_failed for empty or non-JSON stdout", () => {
    expect(parseStdoutResultEnvelope("")).toMatchObject({
      outcome: { ok: false, error: { code: "invocation_failed" } },
      timings: null,
    });
    expect(parseStdoutResultEnvelope("not-json")).toMatchObject({
      outcome: { ok: false, error: { code: "invocation_failed" } },
      timings: null,
    });
  });
});
