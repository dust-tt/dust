import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { WorkspaceType } from "@app/types/user";
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

function getRestrictionImpact(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_restriction_impact`
  );
}

async function createPodFunction(
  auth: Authenticator,
  space: SpaceResource,
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

// A workspace member with their own Authenticator, so invocations can be attributed to them.
async function createWorkspaceMember(workspace: WorkspaceType) {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });

  return {
    user,
    auth: await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId),
  };
}

describe("GET /api/w/:wId/spaces/:spaceId/project_restriction_impact", () => {
  it("counts only invocations by users who would lose access", async () => {
    const {
      workspace,
      auth,
      user: editor,
    } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace, editor.id);
    const podFunction = await createPodFunction(auth, pod, "run-function");

    // Not a Pod member: loses access once the Pod is restricted.
    const outsider = await createWorkspaceMember(workspace);
    await SandboxFunctionInvocationResource.makeNew(outsider.auth, {
      sandboxFunction: podFunction,
      input: { message: "outsider first" },
    });
    await SandboxFunctionInvocationResource.makeNew(outsider.auth, {
      sandboxFunction: podFunction,
      input: { message: "outsider second" },
    });

    // A Pod member keeps access.
    const podMember = await createWorkspaceMember(workspace);
    const addResult = await pod.addMembers(auth, {
      userIds: [podMember.user.sId],
    });
    expect(addResult.isOk()).toBe(true);
    await SandboxFunctionInvocationResource.makeNew(podMember.auth, {
      sandboxFunction: podFunction,
      input: { message: "member" },
    });

    // The requesting user is a workspace admin, who administrates every space.
    await SandboxFunctionInvocationResource.makeNew(auth, {
      sandboxFunction: podFunction,
      input: { message: "admin" },
    });

    // No human actor: reported apart rather than as a broken user.
    const systemAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SandboxFunctionInvocationResource.makeNew(systemAuth, {
      sandboxFunction: podFunction,
      input: { message: "api key" },
    });

    const response = await getRestrictionImpact(workspace, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      restrictionImpact: {
        brokenInvocationCount: 2,
        brokenUserCount: 1,
        totalInvocationCount: 5,
        nonHumanInvocationCount: 1,
      },
    });
  });

  it("returns zeros for a Pod with no functions", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace, user.id);

    const response = await getRestrictionImpact(workspace, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      restrictionImpact: {
        brokenInvocationCount: 0,
        brokenUserCount: 0,
        totalInvocationCount: 0,
        nonHumanInvocationCount: 0,
      },
    });
  });

  it("rejects spaces that are not projects", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const space = await SpaceFactory.regular(workspace);

    const response = await getRestrictionImpact(workspace, space.sId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Restriction impact is only available for project spaces.",
      },
    });
  });
});
