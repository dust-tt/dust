import { publishPollerJob } from "@app/lib/api/sandbox_functions/poller_channel";
import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxPollerTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import type { SandboxFunctionPollerJob } from "@app/types/api/sandbox_functions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function makeJob(invocationId: string): SandboxFunctionPollerJob {
  return {
    invocationId,
    functionId: "sfn_test",
    slug: "get-state",
    execToken: "sbt-job",
    inputEnvelope: JSON.stringify({ method: "POST" }),
    envVars: { DUST_API_URL: "https://dust.example" },
    timeoutMs: 10_000,
  };
}

function postPollerClaim(
  workspace: { sId: string },
  token: string,
  body: unknown
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/poller/claim`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/w/[wId]/sandbox/poller/claim", () => {
  it("hands the job to the first poller to claim it", async () => {
    const { workspace, sandbox, token } =
      await createSandboxPollerTokenTestContext();
    await publishPollerJob(makeJob("sfi_claim_1"), { sandboxId: sandbox.sId });

    const first = await postPollerClaim(workspace, token, {
      invocationId: "sfi_claim_1",
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      granted: true,
      job: makeJob("sfi_claim_1"),
    });

    const second = await postPollerClaim(workspace, token, {
      invocationId: "sfi_claim_1",
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ granted: false });
  });

  it("refuses an invocation dispatched to another pod", async () => {
    const { workspace, token } = await createSandboxPollerTokenTestContext();
    await publishPollerJob(makeJob("sfi_claim_other"), {
      sandboxId: "sbx_someone_else",
    });

    const res = await postPollerClaim(workspace, token, {
      invocationId: "sfi_claim_other",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ granted: false });
  });

  it("refuses an invocation that was never dispatched", async () => {
    const { workspace, token } = await createSandboxPollerTokenTestContext();

    const res = await postPollerClaim(workspace, token, {
      invocationId: "sfi_never_dispatched",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ granted: false });
  });

  it("rejects a function invocation token", async () => {
    const { workspace, token } =
      await createSandboxFunctionInvocationTokenTestContext();

    const res = await postPollerClaim(workspace, token, {
      invocationId: "sfi_claim_2",
    });

    expect(res.status).toBe(403);
  });

  it("rejects an agent action token", async () => {
    const { workspace, token } = await createSandboxTokenTestContext();

    const res = await postPollerClaim(workspace, token, {
      invocationId: "sfi_claim_3",
    });

    expect(res.status).toBe(403);
  });

  it("rejects a request without a token", async () => {
    const { workspace } = await createSandboxPollerTokenTestContext();

    const res = await honoApp.request(
      `/api/v1/w/${workspace.sId}/sandbox/poller/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invocationId: "sfi_claim_4" }),
      }
    );

    expect(res.status).toBe(401);
  });
});
