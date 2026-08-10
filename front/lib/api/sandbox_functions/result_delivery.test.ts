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

  it("folds stderr into the error when stdout carried no envelope", () => {
    expect(parseStdoutResultEnvelope("", { stderr: "  boom  " })).toMatchObject(
      {
        outcome: {
          ok: false,
          error: {
            code: "invocation_failed",
            message: "Pod function produced no stdout result envelope.\nboom",
          },
        },
      }
    );
    expect(
      parseStdoutResultEnvelope("not-json", { stderr: "boom" })
    ).toMatchObject({
      outcome: {
        ok: false,
        error: {
          code: "invocation_failed",
          message: "Pod function stdout was not valid JSON.\nboom",
        },
      },
    });
  });

  it("leaves the message alone when stderr is empty", () => {
    expect(parseStdoutResultEnvelope("", { stderr: "   " })).toMatchObject({
      outcome: {
        ok: false,
        error: {
          code: "invocation_failed",
          message: "Pod function produced no stdout result envelope.",
        },
      },
    });
  });
});
