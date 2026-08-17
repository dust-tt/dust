import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { listPodAppTools } from "@app/lib/api/actions/servers/pod_app_toolset/tools";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { PodAppShareFactory } from "@app/tests/utils/PodAppShareFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(
    async (_lockName: string, callback: () => Promise<unknown>) => callback()
  ),
}));

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "What to look for." },
  },
  required: ["query"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { items: { type: "array" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

async function setupSharedApp() {
  const { authenticator: adminAuth, workspace } = await createResourceTest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace);

  const makeFunction = async (
    slug: string,
    fileName: string,
    userIdentity?: SandboxFunctionUserIdentityPolicy
  ) => {
    const file = await FileFactory.create(adminAuth, null, {
      contentType: sandboxFunctionContentType,
      fileName,
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    return SandboxFunctionResource.makeNew(adminAuth, {
      space: pod,
      file,
      slug,
      description: `Function ${slug}.`,
      userIdentity,
      inputSchema,
      outputSchema,
    });
  };

  const mcpServerId = internalMCPServerNameToSId({
    name: "pod_app_toolset",
    workspaceId: workspace.id,
    prefix: 123456,
  });
  const share = await PodAppShareFactory.create(adminAuth, {
    space: pod,
    appPrefix: "notes",
    internalMCPServerId: mcpServerId,
  });

  const outsider = await UserFactory.basic();
  await MembershipFactory.associate(workspace, outsider, { role: "user" });
  const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
    outsider.sId,
    workspace.sId
  );
  assert(outsiderAuth, "Expected an authenticator for the outsider");

  return {
    adminAuth,
    workspace,
    pod,
    share,
    mcpServerId,
    makeFunction,
    outsiderAuth,
  };
}

async function addPodMember(
  adminAuth: Authenticator,
  workspace: WorkspaceType,
  pod: SpaceResource
) {
  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, { role: "user" });
  const memberGroupReference = pod.groups.find((group) =>
    group.isRegularAuto()
  );
  assert(memberGroupReference, "Expected a member group on the pod");
  const [memberGroup] = await pod.fetchGroupResources(adminAuth, {
    groupReferences: [memberGroupReference],
  });
  const addResult = await memberGroup.dangerouslyAddMember(adminAuth, {
    user: member.toJSON(),
  });
  assert(addResult.isOk(), "Expected member group membership to be added");
  const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspace.sId
  );
  assert(memberAuth, "Expected an authenticator for the pod member");
  return memberAuth;
}

describe("pod_app_toolset listPodAppTools", () => {
  it("lists one tool per published function with the stored JSON Schema verbatim", async () => {
    const { mcpServerId, makeFunction, outsiderAuth } = await setupSharedApp();
    await makeFunction("notes__list", "list.ts");
    await makeFunction("notes__add-note", "add-note.ts");
    await makeFunction("other__fn", "fn.ts");

    const tools = await listPodAppTools(outsiderAuth, mcpServerId);

    expect(tools.map(({ name }) => name).sort()).toEqual(["add-note", "list"]);
    const listTool = tools.find(({ name }) => name === "list");
    expect(listTool?.description).toBe("Function notes__list.");
    expect(listTool?.inputSchema).toEqual(inputSchema);
    expect(listTool?._meta).toEqual({
      dust: {
        stake: "low",
        displayLabels: {
          running: "Calling list...",
          done: "Called list",
        },
      },
    });
  });

  it("filters functions whose policy the caller can never satisfy", async () => {
    const { adminAuth, mcpServerId, makeFunction, outsiderAuth } =
      await setupSharedApp();
    await makeFunction("notes__list", "list.ts");
    await makeFunction(
      "notes__members-only",
      "members-only.ts",
      "pod_member_required"
    );
    await makeFunction(
      "notes__interactive",
      "interactive.ts",
      "interactive_workspace_user_required"
    );

    const outsiderTools = await listPodAppTools(outsiderAuth, mcpServerId);
    expect(outsiderTools.map(({ name }) => name)).toEqual(["list"]);

    // The workspace admin here is not a pod member either (admin standing is not membership),
    // so pod_member_required is filtered for them too.
    const adminTools = await listPodAppTools(adminAuth, mcpServerId);
    expect(adminTools.map(({ name }) => name)).toEqual(["list"]);
  });

  it("lists pod_member_required functions for pod members", async () => {
    const { adminAuth, workspace, pod, mcpServerId, makeFunction } =
      await setupSharedApp();
    await makeFunction(
      "notes__members-only",
      "members-only.ts",
      "pod_member_required"
    );

    const memberAuth = await addPodMember(adminAuth, workspace, pod);
    const memberTools = await listPodAppTools(memberAuth, mcpServerId);
    expect(memberTools.map(({ name }) => name)).toEqual(["members-only"]);
  });

  it("returns no tools for an unknown server id", async () => {
    const { workspace, outsiderAuth } = await setupSharedApp();

    const unknownServerId = internalMCPServerNameToSId({
      name: "pod_app_toolset",
      workspaceId: workspace.id,
      prefix: 654321,
    });
    expect(await listPodAppTools(outsiderAuth, unknownServerId)).toEqual([]);
  });
});
