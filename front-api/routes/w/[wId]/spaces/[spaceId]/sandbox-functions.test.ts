import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { UserFactory } from "@app/tests/utils/UserFactory";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  fileStorageMock.reset();
});

const inputSchema: JSONSchema = {
  type: "object",
  properties: { message: { type: "string" } },
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
};

async function createPodFunction(
  auth: Authenticator,
  space: Awaited<ReturnType<typeof SpaceFactory.project>>,
  slug: string
) {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: `${slug}.ts`,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    slug,
    description: `Run ${slug}.`,
    inputSchema,
    outputSchema,
  });
}

async function setup({
  withFeatureFlag = true,
}: {
  withFeatureFlag?: boolean;
} = {}) {
  const {
    workspace,
    auth: adminAuth,
    user: admin,
  } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withFeatureFlag) {
    await FeatureFlagFactory.basic(adminAuth, "sandbox_functions");
  }

  const space = await SpaceFactory.project(workspace);
  // Pods are restricted: a workspace admin who is not a member fails `canRead`, like every other
  // pod content route (see the Files routes). The requester has to join the pod.
  await addPodMember(adminAuth, space, admin);

  // Re-authenticate so the Authenticator carries the pod group membership just granted; the one
  // from the mock request was built before it and still fails `space.canRead`.
  const podMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
    admin.sId,
    workspace.sId
  );

  return { workspace, adminAuth: podMemberAuth, admin, space };
}

// Adds `member` to the pod's regular member group, so it passes `space.canRead` without
// passing `space.canAdministrate`.
async function addPodMember(
  adminAuth: Authenticator,
  space: Awaited<ReturnType<typeof SpaceFactory.project>>,
  user: Awaited<ReturnType<typeof UserFactory.basic>>
) {
  const [memberGroup] = await space.fetchGroupResources(adminAuth, {
    groupReferences: space.groups.filter((group) => group.isRegularAuto()),
  });
  if (!memberGroup) {
    throw new Error("Expected the pod member group to exist.");
  }
  const addResult = await memberGroup.dangerouslyAddMember(adminAuth, {
    user: user.toJSON(),
  });
  expect(addResult.isOk()).toBe(true);
}

function listUrl(workspaceId: string, spaceId: string) {
  return `/api/w/${workspaceId}/spaces/${spaceId}/sandbox-functions`;
}

describe("GET /api/w/:wId/spaces/:spaceId/sandbox-functions", () => {
  it("returns each function with its contract and pod-wide activity", async () => {
    const { workspace, adminAuth, space } = await setup();

    const digest = await createPodFunction(adminAuth, space, "send-digest");
    const succeeded = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction: digest, input: { message: "one" } }
    );
    await succeeded.succeed({ ok: true });
    const errored = await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: digest,
      input: { message: "two" },
    });
    await errored.fail(new Error("boom"));

    await createPodFunction(adminAuth, space, "refresh-cache");

    const response = await honoApp.request(listUrl(workspace.sId, space.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.functions).toHaveLength(2);

    const digestJson = data.functions.find(
      (fn: { slug: string }) => fn.slug === "send-digest"
    );
    expect(digestJson).toMatchObject({
      sId: digest.sId,
      description: "Run send-digest.",
      userIdentity: "optional",
      inputSchema,
      outputSchema,
    });
    // The latest run wins, whatever its status, and both runs are counted.
    expect(digestJson.activity).toMatchObject({
      lastRunStatus: "errored",
      runCountLastWeek: 2,
    });
    expect(digestJson.activity.lastRunAt).not.toBeNull();

    const cacheJson = data.functions.find(
      (fn: { slug: string }) => fn.slug === "refresh-cache"
    );
    expect(cacheJson.activity).toEqual({
      lastRunAt: null,
      lastRunStatus: null,
      runCountLastWeek: 0,
    });
  });

  it("reports activity from other members' runs", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );

    const invocation = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction: podFunction, input: { message: "admin run" } }
    );
    await invocation.succeed({ ok: true });

    // Re-authenticate as a plain pod member: the admin's run is not theirs, but the activity
    // summary is pod-wide.
    const { user: member } = await createPrivateApiMockRequest({
      role: "user",
      workspace,
    });
    await addPodMember(adminAuth, space, member);

    const response = await honoApp.request(listUrl(workspace.sId, space.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.functions[0].activity).toMatchObject({
      lastRunStatus: "succeeded",
      runCountLastWeek: 1,
    });
  });

  it("excludes functions of other pods", async () => {
    const { workspace, adminAuth, space } = await setup();
    await createPodFunction(adminAuth, space, "send-digest");

    const otherSpace = await SpaceFactory.project(workspace);
    await createPodFunction(adminAuth, otherSpace, "other-function");

    const response = await honoApp.request(listUrl(workspace.sId, space.sId));

    const data = await response.json();
    expect(data.functions.map((fn: { slug: string }) => fn.slug)).toEqual([
      "send-digest",
    ]);
  });

  it("403s when the workspace lacks the sandbox_functions flag", async () => {
    const { workspace, space } = await setup({ withFeatureFlag: false });

    const response = await honoApp.request(listUrl(workspace.sId, space.sId));

    expect(response.status).toBe(403);
  });

  it("404s for a workspace member who is not in the pod", async () => {
    const { workspace, adminAuth, space } = await setup();
    await createPodFunction(adminAuth, space, "send-digest");

    // Re-authenticates as a fresh workspace member who was never added to the pod.
    await createPrivateApiMockRequest({ role: "user", workspace });

    const response = await honoApp.request(listUrl(workspace.sId, space.sId));

    expect(response.status).toBe(404);
  });
});

describe("GET .../sandbox-functions/frame-usage", () => {
  // A published frame stores its built bundle as the processed version; `minify: false` keeps the
  // `callFunction("<ref>")` literal verbatim, which is what the scan looks for.
  async function createPublishedFrame(
    auth: Authenticator,
    space: Awaited<ReturnType<typeof SpaceFactory.project>>,
    fileName: string
  ) {
    return FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName,
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: space.sId,
        frameBundleRootPath: `pod-${space.sId}`,
        frameEntryRelPath: fileName,
      },
    });
  }

  it("finds the frames whose bundle calls the function", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );
    await createPodFunction(adminAuth, space, "refresh-cache");

    const caller = await createPublishedFrame(
      adminAuth,
      space,
      "Dashboard.tsx"
    );
    const bystander = await createPublishedFrame(
      adminAuth,
      space,
      "Unrelated.tsx"
    );

    fileStorageMock.setFileContent((filePath) => {
      if (!filePath.endsWith("processed")) {
        return null;
      }
      return filePath.includes(caller.sId)
        ? `callFunction("${space.sId}/send-digest", { date: "2026-08-03" });`
        : "export default function Unrelated() { return null; }";
    });

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/frame-usage`
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    const digestUsage = data.usage.find(
      (entry: { functionId: string }) => entry.functionId === podFunction.sId
    );
    expect(digestUsage.frames).toEqual([
      { fileId: caller.sId, fileName: "Dashboard.tsx" },
    ]);
    expect(digestUsage.frames).not.toContainEqual(
      expect.objectContaining({ fileId: bystander.sId })
    );

    // Every function is reported, including the ones nothing calls.
    expect(data.usage).toHaveLength(2);
    const cacheUsage = data.usage.find(
      (entry: { functionId: string }) => entry.functionId !== podFunction.sId
    );
    expect(cacheUsage.frames).toEqual([]);
  });

  it("matches the sId reference form and ignores a longer slug that merely contains it", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(adminAuth, space, "digest");

    const bySId = await createPublishedFrame(adminAuth, space, "BySId.tsx");
    const nearMiss = await createPublishedFrame(
      adminAuth,
      space,
      "NearMiss.tsx"
    );

    fileStorageMock.setFileContent((filePath) => {
      if (!filePath.endsWith("processed")) {
        return null;
      }
      if (filePath.includes(bySId.sId)) {
        return `callFunction("${podFunction.sId}", {});`;
      }
      // Same pod, a slug that merely contains "digest": must not match.
      return `callFunction("${space.sId}/send-digest-weekly", {});`;
    });

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/frame-usage`
    );

    const data = await response.json();
    expect(data.usage[0].frames).toEqual([
      { fileId: bySId.sId, fileName: "BySId.tsx" },
    ]);
    expect(data.usage[0].frames).not.toContainEqual(
      expect.objectContaining({ fileId: nearMiss.sId })
    );
  });

  it("includes an unpublished frame, which renders from its source", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );

    // No frameBundleRootPath, so `getRenderableVersion` falls back to the original: the frame
    // still renders and still calls the function.
    const draft = await FileFactory.create(adminAuth, null, {
      contentType: frameContentType,
      fileName: "Draft.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    fileStorageMock.setFileContent((filePath) =>
      filePath.endsWith("original")
        ? `callFunction("${space.sId}/send-digest", {});`
        : null
    );

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/frame-usage`
    );

    const data = await response.json();
    expect(data.usage).toEqual([
      {
        functionId: podFunction.sId,
        frames: [{ fileId: draft.sId, fileName: "Draft.tsx" }],
      },
    ]);
  });

  it("finds frames created in the pod's conversations", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(adminAuth, space, "counter");

    // The common shape in practice: an agent builds a frame inside a pod conversation, so the
    // file is conversation-scoped and only reaches the pod through the conversation's space.
    const conversation = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: "dust",
      messagesCreatedAt: [],
      spaceId: space.id,
    });
    const frame = await FileFactory.create(adminAuth, null, {
      contentType: frameContentType,
      fileName: "CounterFrame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    fileStorageMock.setFileContent((filePath) =>
      filePath.endsWith("original")
        ? `callFunction("${space.sId}/counter", {});`
        : null
    );

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/frame-usage`
    );

    const data = await response.json();
    expect(data.usage).toEqual([
      {
        functionId: podFunction.sId,
        frames: [{ fileId: frame.sId, fileName: "CounterFrame.tsx" }],
      },
    ]);
  });

  it("ignores frames from a conversation in another pod", async () => {
    const { workspace, adminAuth, admin, space } = await setup();
    const podFunction = await createPodFunction(adminAuth, space, "counter");

    const otherSpace = await SpaceFactory.project(workspace);
    await addPodMember(adminAuth, otherSpace, admin);
    const otherPodAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const otherConversation = await ConversationFactory.create(otherPodAuth, {
      agentConfigurationId: "dust",
      messagesCreatedAt: [],
      spaceId: otherSpace.id,
    });
    await FileFactory.create(adminAuth, null, {
      contentType: frameContentType,
      fileName: "Elsewhere.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: otherConversation.sId },
    });

    fileStorageMock.setFileContent(
      () => `callFunction("${space.sId}/counter", {});`
    );

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/frame-usage`
    );

    const data = await response.json();
    expect(data.usage).toEqual([{ functionId: podFunction.sId, frames: [] }]);
  });
});

describe("GET .../sandbox-functions/:functionId/last-failure", () => {
  it("returns the last failure's error, without the run payload", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );

    const succeeded = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction: podFunction, input: { message: "fine" } }
    );
    await succeeded.succeed({ ok: true });
    const errored = await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: podFunction,
      input: { message: "secret input" },
    });
    await errored.fail(new Error("boom"));

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/${podFunction.sId}/last-failure`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.failure).toMatchObject({
      code: "invocation_failed",
      message: "boom",
      origin: "delegated",
    });
    expect(JSON.stringify(data)).not.toContain("secret input");
  });

  it("hides another member's failure from a plain pod member", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );

    const errored = await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: podFunction,
      input: { message: "admin run" },
    });
    await errored.fail(new Error("boom"));

    const { user: member } = await createPrivateApiMockRequest({
      role: "user",
      workspace,
    });
    await addPodMember(adminAuth, space, member);

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/${podFunction.sId}/last-failure`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.failure).toBeNull();
  });

  it("shows a member their own failure", async () => {
    const { workspace, adminAuth, space } = await setup();
    const podFunction = await createPodFunction(
      adminAuth,
      space,
      "send-digest"
    );

    const { user: member } = await createPrivateApiMockRequest({
      role: "user",
      workspace,
    });
    await addPodMember(adminAuth, space, member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const errored = await SandboxFunctionInvocationResource.makeNew(
      memberAuth,
      {
        sandboxFunction: podFunction,
        input: { message: "member run" },
      }
    );
    await errored.fail(new Error("member boom"));

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/${podFunction.sId}/last-failure`
    );

    const data = await response.json();
    expect(data.failure).toMatchObject({ message: "member boom" });
  });

  it("returns null for a function of another pod", async () => {
    const { workspace, adminAuth, space } = await setup();
    const otherSpace = await SpaceFactory.project(workspace);
    const otherFunction = await createPodFunction(
      adminAuth,
      otherSpace,
      "other-function"
    );
    const errored = await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: otherFunction,
      input: undefined,
    });
    await errored.fail(new Error("boom"));

    const response = await honoApp.request(
      `${listUrl(workspace.sId, space.sId)}/${otherFunction.sId}/last-failure`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.failure).toBeNull();
  });
});
