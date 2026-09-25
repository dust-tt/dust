import { createRun } from "@app/lib/evals/store";
import { EvalConfigSchema } from "@app/lib/evals/types";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

const config = EvalConfigSchema.parse({ rows: [{ prompt: "Hi", judgePrompt: "Greeting?" }], variants: [{ agentId: "dust" }], judge: { agentId: "dust" } });
describe("durable eval API authorization", () => {
  it("requires the rollout flag even for admins", async () => {
    const { workspace, key } = await createPublicApiMockRequest({ role: "admin" });
    const response = await honoApp.request(`/api/v1/w/${workspace.sId}/evals/runs`, { headers: { authorization: `Bearer ${key.secret}` } });
    expect(response.status).toBe(403);
  });
  it("rejects non-admins even when the flag is enabled", async () => {
    const { auth, workspace, key } = await createPublicApiMockRequest();
    await FeatureFlagFactory.basic(auth, "durable_evals");
    const response = await honoApp.request(`/api/v1/w/${workspace.sId}/evals/runs`, { headers: { authorization: `Bearer ${key.secret}` } });
    expect(response.status).toBe(403);
  });
  it("does not expose or cancel another workspace's run", async () => {
    const first = await createPublicApiMockRequest({ role: "admin" });
    const second = await createPublicApiMockRequest({ role: "admin" });
    await FeatureFlagFactory.basic(second.auth, "durable_evals");
    const runId = randomUUID();
    await createRun(first.auth, runId, config);
    for (const suffix of ["", "/steps", "/cancel"]) {
      const response = await honoApp.request(`/api/v1/w/${second.workspace.sId}/evals/runs/${runId}${suffix}`, {
        method: suffix === "/cancel" ? "POST" : "GET",
        headers: { authorization: `Bearer ${second.key.secret}` },
      });
      expect(response.status).toBe(404);
    }
  });
});
