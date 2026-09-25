import { createRun, EvalRunConflictError } from "@app/lib/evals/store";
import { EvalConfigSchema } from "@app/lib/evals/types";
import { EvalStepModel } from "@app/lib/models/eval_run";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

const config = EvalConfigSchema.parse({ rows: [{ prompt: "Hi", judgePrompt: "Greeting?" }], variants: [{ agentId: "dust" }], judge: { agentId: "dust" }, repetitions: 2, judgeRuns: 2 });
describe("eval persistence", () => {
  it("creates the entire run atomically and deduplicates the run ID", async () => {
    const { auth, workspace } = await createPublicApiMockRequest({ role: "admin" });
    const runId = randomUUID();
    const first = await createRun(auth, runId, config);
    const second = await createRun(auth, runId, config);
    expect(first.id).toBe(second.id);
    expect(await EvalStepModel.count({ where: { workspaceId: workspace.id, runId } })).toBe(6);
  });
  it("rejects a reused ID with different inputs", async () => {
    const { auth } = await createPublicApiMockRequest({ role: "admin" });
    const runId = randomUUID();
    await createRun(auth, runId, config);
    await expect(createRun(auth, runId, { ...config, repetitions: 3 })).rejects.toBeInstanceOf(EvalRunConflictError);
  });
  it("isolates the same run ID across workspaces", async () => {
    const first = await createPublicApiMockRequest({ role: "admin" });
    const second = await createPublicApiMockRequest({ role: "admin" });
    const runId = randomUUID();
    const a = await createRun(first.auth, runId, config);
    const b = await createRun(second.auth, runId, config);
    expect(a.id).not.toBe(b.id);
    expect(a.workspaceId).not.toBe(b.workspaceId);
  });
});
