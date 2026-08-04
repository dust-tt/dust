import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
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

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });

  const space = await SpaceFactory.project(workspace);
  const podFunction = await createPodFunction(auth, space, "run-function");

  const succeededInvocation = await SandboxFunctionInvocationResource.makeNew(
    auth,
    { sandboxFunction: podFunction, input: { message: "first" } }
  );
  await succeededInvocation.succeed({ ok: true });

  const erroredInvocation = await SandboxFunctionInvocationResource.makeNew(
    auth,
    { sandboxFunction: podFunction, input: { message: "second" } }
  );
  await erroredInvocation.fail(new Error("boom"));

  const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "common_utilities",
    useCase: null,
  });
  const mcpServerView = await MCPServerViewFactory.create(
    workspace,
    server.id,
    space
  );
  const action = await SandboxFunctionMCPActionFactory.create(auth, {
    invocation: erroredInvocation,
    mcpServerView,
  });
  const outputResult = await action.createOutputItems(auth, [
    { content: { type: "text", text: "tool output" } },
  ]);
  expect(outputResult.isOk()).toBe(true);
  await action.markAsErrored({ executionDurationMs: 120 });

  return {
    action,
    auth,
    erroredInvocation,
    mcpServerView,
    podFunction,
    space,
    succeededInvocation,
    workspace,
  };
}

function podFunctionUrl(
  workspaceId: string,
  spaceId: string,
  functionId: string
) {
  return `/api/poke/workspaces/${workspaceId}/projects/${spaceId}/pod-functions/${functionId}`;
}

describe("GET /api/poke/workspaces/:wId/projects/:projectId/pod-functions/:functionId", () => {
  it("returns the function with its schemas and bundle file", async () => {
    const { workspace, space, podFunction } = await setup();

    const response = await honoApp.request(
      podFunctionUrl(workspace.sId, space.sId, podFunction.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.podFunction).toMatchObject({
      sId: podFunction.sId,
      slug: "run-function",
      fileId: podFunction.file.sId,
      inputSchema,
      outputSchema,
    });
  });

  it("serves the published bundle source", async () => {
    const { workspace, space, podFunction } = await setup();

    const source =
      "export default async function run() { return { ok: true }; }";
    fileStorageMock.setFileContent(() => source);

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/source`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.source).toBe(source);
  });

  it("404s for a function that belongs to another pod", async () => {
    const { workspace, auth, space } = await setup();

    const otherSpace = await SpaceFactory.project(workspace);
    const otherFunction = await createPodFunction(
      auth,
      otherSpace,
      "other-function"
    );

    const response = await honoApp.request(
      podFunctionUrl(workspace.sId, space.sId, otherFunction.sId)
    );

    expect(response.status).toBe(404);
  });

  it("401s for a non-superuser", async () => {
    const { workspace, space, podFunction } = await setup();
    await createPrivateApiMockRequest({ role: "admin", workspace });

    const response = await honoApp.request(
      podFunctionUrl(workspace.sId, space.sId, podFunction.sId)
    );

    expect(response.status).toBe(401);
  });
});

describe("GET .../pod-functions/:functionId/invocations", () => {
  it("lists invocations newest first, with action counts and without payloads", async () => {
    const { workspace, space, podFunction, erroredInvocation } = await setup();

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      sId: erroredInvocation.sId,
      status: "errored",
      origin: "delegated",
      mcpActionCount: 1,
    });
    expect(data.items[1]).toMatchObject({ status: "succeeded" });
    // The listing is DB-only: payloads are served by the per-invocation endpoint.
    expect(data.items[0].input).toBeUndefined();
    expect(data.items[0].result).toBeUndefined();
  });

  it("filters on status", async () => {
    const { workspace, space, podFunction, succeededInvocation } =
      await setup();

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations?status=succeeded`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items.map((item: { sId: string }) => item.sId)).toEqual([
      succeededInvocation.sId,
    ]);
  });
});

describe("GET .../invocations/:invocationId", () => {
  it("returns the hydrated payload and its MCP actions", async () => {
    const { workspace, space, podFunction, erroredInvocation, action } =
      await setup();

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations/${erroredInvocation.sId}`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.invocation).toMatchObject({
      sId: erroredInvocation.sId,
      status: "errored",
      input: { message: "second" },
      error: { code: "invocation_failed", message: "boom" },
    });
    expect(data.invocation.mcpActions).toHaveLength(1);
    expect(data.invocation.mcpActions[0]).toMatchObject({
      sId: action.sId,
      toolName: "math_operation",
      status: "errored",
      executionDurationMs: 120,
      hasOutput: true,
      mcpServerName: "common_utilities",
    });
  });

  it("404s for an invocation of another function", async () => {
    const { workspace, auth, space, podFunction } = await setup();

    const otherFunction = await createPodFunction(auth, space, "other-in-pod");
    const otherInvocation = await SandboxFunctionInvocationResource.makeNew(
      auth,
      { sandboxFunction: otherFunction, input: undefined }
    );

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations/${otherInvocation.sId}`
    );

    expect(response.status).toBe(404);
  });
});

describe("GET .../invocations/:invocationId/actions/:actionId/output", () => {
  it("returns the stored MCP action output", async () => {
    const { workspace, space, podFunction, erroredInvocation, action } =
      await setup();

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations/${erroredInvocation.sId}/actions/${action.sId}/output`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.output).toEqual([{ type: "text", text: "tool output" }]);
  });

  it("404s for an action of another invocation", async () => {
    const { workspace, space, podFunction, succeededInvocation, action } =
      await setup();

    const response = await honoApp.request(
      `${podFunctionUrl(workspace.sId, space.sId, podFunction.sId)}/invocations/${succeededInvocation.sId}/actions/${action.sId}/output`
    );

    expect(response.status).toBe(404);
  });
});
