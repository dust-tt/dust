import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory GCS mock: writes persist content that reads can return.
const gcsStore = new Map<string, Buffer>();

vi.mock("@app/lib/file_storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/file_storage")>();
  return {
    ...original,
    getPrivateUploadBucket: vi.fn(() => ({
      file: vi.fn((path: string) => ({
        save: vi.fn(async (data: Buffer) => {
          gcsStore.set(path, data);
        }),
        download: vi.fn(async () => {
          const buf = gcsStore.get(path);
          if (!buf) {
            throw new Error(`GCS file not found: ${path}`);
          }
          return [buf];
        }),
      })),
      delete: vi.fn(async (path: string) => {
        gcsStore.delete(path);
      }),
      uploadBufferToBucket: vi.fn(
        async ({ buffer, filePath }: { buffer: Buffer; filePath: string }) => {
          gcsStore.set(filePath, buffer);
        }
      ),
    })),
  };
});

function getSandboxAction(
  workspace: { sId: string },
  token: string,
  actionId: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/sandbox/actions/${actionId}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
}

async function setupWithAction() {
  const context =
    await createPersistedSandboxFunctionInvocationTokenTestContext();
  const commonUtilities = await InternalMCPServerInMemoryResource.makeNew(
    context.auth,
    { name: "common_utilities", useCase: null }
  );
  const view = await MCPServerViewFactory.create(
    context.workspace,
    commonUtilities.id,
    context.globalSpace
  );
  const action = await SandboxFunctionMCPActionFactory.create(context.auth, {
    invocation: context.invocation,
    mcpServerView: view,
    toolName: "generate_random_number",
    inputs: { max: 10 },
  });
  return { ...context, view, action };
}

describe("GET /api/v1/w/[wId]/sandbox/actions/[aId] (function invocation)", () => {
  beforeEach(() => {
    gcsStore.clear();
  });

  it("returns pending while the action is running", async () => {
    const { token, workspace, action } = await setupWithAction();

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: "pending",
      actionId: action.sId,
    });
  });

  it("returns pending while the action awaits authentication", async () => {
    const { token, workspace, action } = await setupWithAction();
    await action.updateStatus("blocked_authentication_required");

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: "pending",
      actionId: action.sId,
    });
  });

  it("returns the output once the action succeeded", async () => {
    const { auth, token, workspace, action } = await setupWithAction();

    const content = [{ type: "text" as const, text: "7" }];
    const writeResult = await action.createOutputItems(
      auth,
      content.map((c) => ({ content: c }))
    );
    expect(writeResult.isOk()).toBe(true);
    await action.markAsSucceeded({ executionDurationMs: 42 });

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.action.status).toBe("succeeded");
    expect(body.action.output).toEqual(content);
    expect(body.action).not.toHaveProperty("structuredContent");
  });

  it("returns the structuredContent alongside the output when present", async () => {
    const { auth, token, workspace, action } = await setupWithAction();

    const content = [{ type: "text" as const, text: "7" }];
    const structuredContent = { value: 7, unit: "count" };
    const writeResult = await action.createOutputItems(
      auth,
      content.map((c) => ({ content: c })),
      { structuredContent }
    );
    expect(writeResult.isOk()).toBe(true);
    await action.markAsSucceeded({ executionDurationMs: 42 });

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.action.output).toEqual(content);
    expect(body.action.structuredContent).toEqual(structuredContent);
  });

  it("returns the output of a legacy bare-array GCS object", async () => {
    const { auth, token, workspace, action } = await setupWithAction();

    // Record the GCS path through the modern write path, then overwrite the object with the
    // legacy bare-array format written by previous deploys.
    const content = [{ type: "text" as const, text: "legacy" }];
    const writeResult = await action.createOutputItems(auth, [
      { content: { type: "text", text: "placeholder" } },
    ]);
    expect(writeResult.isOk()).toBe(true);
    const [gcsPath] = [...gcsStore.keys()].filter((path) =>
      path.endsWith(`${action.sId}/output.json`)
    );
    expect(gcsPath).toBeDefined();
    gcsStore.set(gcsPath, Buffer.from(JSON.stringify(content), "utf-8"));
    await action.markAsSucceeded({ executionDurationMs: 42 });

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action.output).toEqual(content);
    expect(body.action).not.toHaveProperty("structuredContent");
  });

  it("serves content block _meta (offload descriptor) verbatim", async () => {
    const { auth, token, workspace, action } = await setupWithAction();

    // Shape produced by the tool-output offload path: a snippet resource block carrying the
    // machine-readable descriptor in _meta. The route must serve it verbatim so in-sandbox
    // consumers can resolve the full content.
    const content = [
      {
        type: "resource" as const,
        resource: {
          uri: "pod-spc_x/.tool_outputs/fn/1_tool.json",
          mimeType: "text/plain",
          text: '{"items":[{"id":1... (truncated)\n[Full content archived at pod-spc_x/.tool_outputs/fn/1_tool.json]',
        },
        _meta: {
          "tt.dust/offload": {
            fullContentPath: "pod-spc_x/.tool_outputs/fn/1_tool.json",
            totalBytes: 123456,
            contentType: "application/json",
          },
        },
      },
    ];
    const writeResult = await action.createOutputItems(
      auth,
      content.map((c) => ({ content: c }))
    );
    expect(writeResult.isOk()).toBe(true);
    await action.markAsSucceeded({ executionDurationMs: 42 });

    const response = await getSandboxAction(workspace, token, action.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.action.output).toEqual(content);
  });

  it("scopes actions to the token's invocation", async () => {
    const { auth, token, workspace, view, sandboxFunction, action } =
      await setupWithAction();

    // An action of another invocation of the same function is not visible.
    const otherInvocation = await SandboxFunctionInvocationResource.makeNew(
      auth,
      { sandboxFunction, input: undefined }
    );
    const otherAction = await SandboxFunctionMCPActionFactory.create(auth, {
      invocation: otherInvocation,
      mcpServerView: view,
    });

    const otherResponse = await getSandboxAction(
      workspace,
      token,
      otherAction.sId
    );
    expect(otherResponse.status).toBe(404);

    // The token's own action stays visible.
    const ownResponse = await getSandboxAction(workspace, token, action.sId);
    expect(ownResponse.status).toBe(202);
  });
});
