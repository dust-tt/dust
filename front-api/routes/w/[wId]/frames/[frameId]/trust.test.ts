import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// The request user views a Frame another workspace member published.
async function setup({
  executionMode = "durable",
}: { executionMode?: SandboxFunctionExecutionMode } = {}) {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  const publisher = await UserFactory.basic();
  await MembershipFactory.associate(workspace, publisher, { role: "user" });
  const publisherAuth = await Authenticator.fromUserIdAndWorkspaceId(
    publisher.sId,
    workspace.sId
  );
  const space = await SpaceFactory.project(workspace);
  const { frame } = await createTestFrameFunction(publisherAuth, {
    space,
    executionMode,
  });
  await frame.setShareScope(publisherAuth, "workspace_and_emails");

  return {
    auth,
    publisher,
    url: `/api/w/${workspace.sId}/frames/${frame.sId}/trust`,
  };
}

function postTrust(url: string, publisherId: string) {
  return honoApp.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publisherId }),
  });
}

describe("/api/w/:wId/frames/:frameId/trust", () => {
  it("asks to trust the publisher of a Frame that can call tools", async () => {
    const { publisher, url } = await setup();

    const response = await honoApp.request(url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trust: {
        status: "untrusted",
        publisher: expect.objectContaining({ sId: publisher.sId }),
      },
    });
  });

  it("records trust in the publisher the viewer was shown", async () => {
    const { publisher, url } = await setup();

    const response = await postTrust(url, publisher.sId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trust: { status: "trusted" },
    });
    await expect((await honoApp.request(url)).json()).resolves.toEqual({
      trust: { status: "trusted" },
    });
  });

  it("refuses to trust a publisher the viewer was not shown", async () => {
    const { auth, url } = await setup();

    const response = await postTrust(url, auth.getNonNullableUser().sId);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_publisher_changed" },
    });
  });

  it("needs no trust when the Frame's functions can't call tools", async () => {
    const { url } = await setup({ executionMode: "fast" });

    const response = await honoApp.request(url);

    await expect(response.json()).resolves.toEqual({
      trust: { status: "not_required" },
    });
  });
});
