import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function postSandboxFunctionResult(
  token: string,
  body: unknown
) {
  return honoApp.request("/api/v1/sandbox/sandbox-functions/result", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/w/[wId]/sandbox/sandbox-functions/result", () => {
  it("returns success for sandbox-authenticated result callbacks", async () => {
    const { token } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
    });

    const response = await postSandboxFunctionResult(token, {
      result: { hello: "world" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
