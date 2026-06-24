import { createConversation } from "@app/lib/api/assistant/conversation";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const conversation = await createConversation(auth, {
    title: null,
    visibility: "unlisted",
    spaceId: null,
  });

  return { workspace, auth, conversation };
}

function getSandboxStatus(workspace: { sId: string }, conversationId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversationId}/sandbox`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/sandbox", () => {
  it("returns the sandbox status when Computer is enabled", async () => {
    const { workspace, auth, conversation } = await setup();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    await SandboxFactory.create(auth, conversation, { status: "running" });

    const response = await getSandboxStatus(workspace, conversation.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sandboxStatus: "running" });
  });

  it("returns null when Computer is enabled and no sandbox exists", async () => {
    const { workspace, auth, conversation } = await setup();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const response = await getSandboxStatus(workspace, conversation.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sandboxStatus: null });
  });

  it("rejects requests when Computer is disabled", async () => {
    const { workspace, auth, conversation } = await setup();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
    await SandboxFactory.create(auth, conversation, { status: "running" });

    const response = await getSandboxStatus(workspace, conversation.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });
});
