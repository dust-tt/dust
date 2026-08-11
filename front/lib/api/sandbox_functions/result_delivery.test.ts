import {
  parseStdoutResultEnvelope,
  resolveSpilledResult,
} from "@app/lib/api/sandbox_functions/result_delivery";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

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
      spill: null,
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
      spill: null,
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
      spill: null,
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
      spill: null,
    });
  });

  it("surfaces a spill pointer instead of an outcome", () => {
    expect(
      parseStdoutResultEnvelope(
        JSON.stringify({
          protocolVersion: 3,
          delivery: "stdout",
          outcome: {
            ok: true,
            resultFile: "/tmp/dust-fn-results/abc.json",
            resultBytes: 300_000,
          },
          timingsMs: { total: 12, runner: 8, runnerKind: "cold" },
        })
      )
    ).toEqual({
      outcome: null,
      spill: {
        ok: true,
        resultFile: "/tmp/dust-fn-results/abc.json",
        resultBytes: 300_000,
      },
      timings: { runnerKind: "cold" },
    });
  });

  it("returns invocation_failed for empty or non-JSON stdout", () => {
    expect(parseStdoutResultEnvelope("")).toMatchObject({
      outcome: { ok: false, error: { code: "invocation_failed" } },
      timings: null,
      spill: null,
    });
    expect(parseStdoutResultEnvelope("not-json")).toMatchObject({
      outcome: { ok: false, error: { code: "invocation_failed" } },
      timings: null,
      spill: null,
    });
  });
});

describe("resolveSpilledResult", () => {
  const spill = {
    ok: true as const,
    resultFile: "/tmp/dust-fn-results/abc.json",
    resultBytes: 300_000,
  };

  it("reads the file back and normalizes its content like an inline outcome", async () => {
    const readFile = vi
      .fn()
      .mockResolvedValue(
        new Ok(
          Buffer.from(
            JSON.stringify({ ok: true, output: { hello: "big world" } }),
            "utf8"
          )
        )
      );

    await expect(resolveSpilledResult(spill, readFile)).resolves.toEqual({
      ok: true,
      output: { hello: "big world" },
    });
    expect(readFile).toHaveBeenCalledWith("/tmp/dust-fn-results/abc.json");
  });

  it("fails with invocation_failed naming the file when the read fails", async () => {
    const readFile = vi.fn().mockResolvedValue(new Err(new Error("gone")));

    await expect(resolveSpilledResult(spill, readFile)).resolves.toEqual({
      ok: false,
      error: {
        code: "invocation_failed",
        message:
          "Pod function result could not be read back from /tmp/dust-fn-results/abc.json: gone",
      },
    });
  });

  it("fails when the file content is not valid JSON", async () => {
    const readFile = vi
      .fn()
      .mockResolvedValue(
        new Ok(Buffer.from('{"ok":true,"output":{"cut', "utf8"))
      );

    await expect(resolveSpilledResult(spill, readFile)).resolves.toMatchObject({
      ok: false,
      error: { code: "invocation_failed" },
    });
  });

  it("refuses to read a pointer outside the spill directory", async () => {
    const readFile = vi.fn();

    for (const resultFile of [
      "/etc/shadow",
      "/tmp/dust-fn-results/../../etc/shadow",
    ]) {
      await expect(
        resolveSpilledResult({ ...spill, resultFile }, readFile)
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "invocation_failed" },
      });
    }
    expect(readFile).not.toHaveBeenCalled();
  });
});
