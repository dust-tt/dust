import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
};

async function setupSandboxFunction({
  addCallerToSpace = true,
  withSandboxFunctionsFeatureFlag = true,
}: {
  addCallerToSpace?: boolean;
  withSandboxFunctionsFeatureFlag?: boolean;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withSandboxFunctionsFeatureFlag) {
    await FeatureFlagFactory.basic(adminAuth, "sandbox_functions");
  }

  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(adminAuth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "function.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(adminAuth, {
    space,
    file,
    inputSchema,
    outputSchema,
  });

  const { user } = await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });
  if (addCallerToSpace) {
    const addMemberResult = await space.groups[0].dangerouslyAddMember(
      adminAuth,
      {
        user: user.toJSON(),
      }
    );
    expect(addMemberResult.isOk()).toBe(true);
  }

  return { workspace, sandboxFunction };
}

function postInvocation({
  workspaceId,
  functionId,
  body = {},
}: {
  workspaceId: string;
  functionId: string;
  body?: unknown;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${functionId}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/sandbox-functions/:functionId/invocations", () => {
  it("creates a UUID-only invocation for a non-admin user with access to the function space", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
      body: {
        input: { message: "hello" },
        context: { frameFileId: sandboxFunction.file.sId },
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      invocation: {
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        ),
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt: expect.any(String),
      },
    });
    expect(Date.parse(body.invocation.createdAt)).not.toBeNaN();
  });

  it("returns 404 when the user cannot access the function space", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      addCallerToSpace: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "sandbox_function_not_found" },
    });
  });

  it("does not require the broader sandbox tools feature flag", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
  });

  it("requires sandbox functions to be enabled", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      withSandboxFunctionsFeatureFlag: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
        message: "Sandbox Functions are not enabled for this workspace.",
      },
    });
  });
});
