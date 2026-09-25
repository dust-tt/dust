import { describe, expect, it } from "vitest";
import { EvalConfigSchema } from "./types";

const input = { rows: [{ prompt: "Hello", judgePrompt: "Is it a greeting?" }], variants: [{ agentId: "dust" }], judge: { agentId: "dust" } };
describe("eval pilot input limits", () => {
  it("supplies bounded defaults", () => {
    const config = EvalConfigSchema.parse(input);
    expect(config.repetitions).toBe(1);
    expect(config.judgeRuns).toBe(1);
    expect(config.concurrency).toBe(2);
  });
  it("rejects excessive fanout and concurrency", () => {
    expect(EvalConfigSchema.safeParse({ ...input, rows: Array(11).fill(input.rows[0]), repetitions: 10 }).success).toBe(false);
    expect(EvalConfigSchema.safeParse({ ...input, concurrency: 6 }).success).toBe(false);
  });
  it("does not accept secrets, caller identity or local file paths", () => {
    for (const extra of [{ apiKey: "not-a-real-key" }, { userId: "someone" }, { csvPath: "/tmp/eval.csv" }]) {
      expect(EvalConfigSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
});
