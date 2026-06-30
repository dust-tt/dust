import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
});

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
    slug: "run-function",
    description: "Run the function.",
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
  it("creates an invocation through the sandbox function resource", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    const createdAt = new Date().toISOString();
    const invokeSpy = vi
      .spyOn(SandboxFunctionResource.prototype, "invoke")
      .mockResolvedValue(
        new Ok({
          sId: "test-invocation-id",
          functionId: sandboxFunction.sId,
          status: "created",
          createdAt,
        })
      );

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
        id: "test-invocation-id",
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt,
      },
    });
    expect(invokeSpy).toHaveBeenCalledWith(expect.anything(), {
      input: { message: "hello" },
      context: { frameFileId: sandboxFunction.file.sId },
    });
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
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValue(
      new Ok({
        sId: "test-invocation-id",
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt: new Date().toISOString(),
      })
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
  });

  it("returns 500 when the resource invocation fails", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValue(
      new Err(new Error("sandbox failed"))
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        type: "internal_server_error",
        message: "Sandbox function invocation failed.",
      },
    });
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
