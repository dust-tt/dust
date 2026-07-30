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
      ok: true,
      output: { hello: "world" },
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
      ok: false,
      error: { code: "threw", message: "boom" },
    });
  });

  it("returns invocation_failed for empty or non-JSON stdout", () => {
    expect(parseStdoutResultEnvelope("")).toMatchObject({
      ok: false,
      error: { code: "invocation_failed" },
    });
    expect(parseStdoutResultEnvelope("not-json")).toMatchObject({
      ok: false,
      error: { code: "invocation_failed" },
    });
  });
});
