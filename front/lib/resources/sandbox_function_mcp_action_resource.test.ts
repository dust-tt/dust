import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
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
      delete: vi.fn(
        async (path: string, opts?: { ignoreNotFound?: boolean }) => {
          if (!gcsStore.has(path) && !opts?.ignoreNotFound) {
            throw new Error(`GCS file not found: ${path}`);
          }
          gcsStore.delete(path);
        }
      ),
      uploadBufferToBucket: vi.fn(
        async ({ buffer, filePath }: { buffer: Buffer; filePath: string }) => {
          gcsStore.set(filePath, buffer);
        }
      ),
    })),
  };
});

const inputSchema: JSONSchema = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { greeting: { type: "string" } },
  required: ["greeting"],
};

async function setup() {
  const { authenticator, workspace, globalSpace } = await createResourceTest({
    role: "admin",
  });

  const podSpace = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(authenticator, null, {
    contentType: sandboxFunctionContentType,
    fileName: "greet.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: podSpace.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(authenticator, {
    space: podSpace,
    file,
    slug: "greet",
    description: "Greet someone.",
    inputSchema,
    outputSchema,
  });
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    authenticator,
    { sandboxFunction, input: undefined }
  );

  const server = await RemoteMCPServerFactory.create(workspace);
  const mcpServerView = await MCPServerViewFactory.create(
    workspace,
    server.sId,
    globalSpace
  );

  return {
    authenticator,
    workspace,
    sandboxFunction,
    invocation,
    mcpServerView,
  };
}

describe("SandboxFunctionMCPActionResource", () => {
  beforeEach(() => {
    gcsStore.clear();
  });

  it("creates an action in running status and fetches it back by sId", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();

    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
      toolName: "math_operation",
      inputs: { expression: "1+1" },
    });

    expect(action.sId).toMatch(/^sfa_/);
    expect(action.status).toBe("running");

    const fetched = await SandboxFunctionMCPActionResource.fetchById(
      authenticator,
      action.sId
    );
    expect(fetched).not.toBeNull();
    expect(fetched?.toolName).toBe("math_operation");
    expect(fetched?.inputs).toEqual({ expression: "1+1" });
    expect(fetched?.sandboxFunctionInvocationId).toBe(invocation.id);
    expect(fetched?.outputGcsPath).toBeNull();
  });

  it("returns null when fetching with a foreign or invalid sId", async () => {
    const { authenticator } = await setup();

    expect(
      await SandboxFunctionMCPActionResource.fetchById(authenticator, "sfa_x")
    ).toBeNull();
    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        "not_an_sid"
      )
    ).toBeNull();
  });

  it("writes the output to a single GCS object and reads it back", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });

    const before = await action.readOutput();
    expect(before.isOk()).toBe(true);
    if (before.isOk()) {
      expect(before.value).toBeNull();
    }

    const content = [{ type: "text" as const, text: "4" }];
    const outputRes = await action.createOutputItems(
      authenticator,
      content.map((c) => ({ content: c }))
    );
    expect(outputRes.isOk()).toBe(true);
    expect(action.outputGcsPath).toContain(action.sId);

    // Without structuredContent the stored object stays a bare content array, so readers of
    // older deploys keep working.
    const storedBuffer = gcsStore.get(
      action.outputGcsPath ?? "missing-output-path"
    );
    expect(JSON.parse(storedBuffer?.toString("utf-8") ?? "")).toEqual(content);

    const readBack = await action.readOutput();
    expect(readBack.isOk()).toBe(true);
    if (readBack.isOk()) {
      expect(readBack.value).toEqual({ content });
    }
  });

  it("writes a versioned envelope when the output carries structuredContent", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });

    const content = [{ type: "text" as const, text: "4" }];
    const structuredContent = { items: [{ id: 1 }], nextCursor: "abc" };
    const outputRes = await action.createOutputItems(
      authenticator,
      content.map((c) => ({ content: c })),
      { structuredContent }
    );
    expect(outputRes.isOk()).toBe(true);

    const storedBuffer = gcsStore.get(
      action.outputGcsPath ?? "missing-output-path"
    );
    expect(JSON.parse(storedBuffer?.toString("utf-8") ?? "")).toEqual({
      version: 2,
      content,
      structuredContent,
    });

    const readBack = await action.readOutput();
    expect(readBack.isOk()).toBe(true);
    if (readBack.isOk()) {
      expect(readBack.value).toEqual({ content, structuredContent });
    }
  });

  it("dual-reads legacy bare-array outputs", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });

    // Persist a modern output to record the GCS path on the row, then overwrite the object with
    // the legacy bare-array format written by previous deploys.
    const content = [{ type: "text" as const, text: "legacy" }];
    const outputRes = await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "placeholder" } },
    ]);
    expect(outputRes.isOk()).toBe(true);
    gcsStore.set(
      action.outputGcsPath ?? "missing-output-path",
      Buffer.from(JSON.stringify(content), "utf-8")
    );

    const readBack = await action.readOutput();
    expect(readBack.isOk()).toBe(true);
    if (readBack.isOk()) {
      expect(readBack.value).toEqual({ content });
    }
  });

  it("errors on an unrecognized output format", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });

    const outputRes = await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "placeholder" } },
    ]);
    expect(outputRes.isOk()).toBe(true);
    const gcsPath = action.outputGcsPath ?? "missing-output-path";

    gcsStore.set(
      gcsPath,
      Buffer.from(JSON.stringify({ not: "an output" }), "utf-8")
    );
    const readBack = await action.readOutput();
    expect(readBack.isErr()).toBe(true);

    // An envelope with an unknown version fails loudly instead of being silently misparsed.
    gcsStore.set(
      gcsPath,
      Buffer.from(JSON.stringify({ version: 3, content: [] }), "utf-8")
    );
    const unknownVersionReadBack = await action.readOutput();
    expect(unknownVersionReadBack.isErr()).toBe(true);
  });

  it("marks the action as succeeded or errored with a duration", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });

    await action.markAsSucceeded({ executionDurationMs: 1_234 });
    expect(action.status).toBe("succeeded");
    expect(action.executionDurationMs).toBe(1_234);
  });

  it("deletes actions and their GCS outputs when the invocation is deleted", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });
    await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "4" } },
    ]);
    expect(gcsStore.size).toBe(2);

    // The action FKs the invocation with RESTRICT: deletion must not throw.
    const deleteResult = await invocation.delete(authenticator);
    expect(deleteResult.isOk()).toBe(true);

    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        action.sId
      )
    ).toBeNull();
    expect(gcsStore.size).toBe(0);
  });

  it("deletes actions across invocations when the sandbox function is deleted", async () => {
    const { authenticator, sandboxFunction, invocation, mcpServerView } =
      await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });
    await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "4" } },
    ]);

    const deleteResult = await sandboxFunction.delete(authenticator);
    expect(deleteResult.isOk()).toBe(true);

    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        action.sId
      )
    ).toBeNull();
    expect(gcsStore.size).toBe(0);
  });

  it("keeps rows and GCS outputs when the enclosing transaction rolls back", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });
    await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "4" } },
    ]);
    expect(gcsStore.size).toBe(2);

    // The invocation data is deleted immediately, while action output deletion remains deferred
    // to afterCommit and the database rows are restored by the rollback.
    await expect(
      frontSequelize.transaction(async (transaction) => {
        await invocation.delete(authenticator, { transaction });
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");

    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        action.sId
      )
    ).not.toBeNull();
    expect(gcsStore.size).toBe(1);
  });

  it("deletes actions and their GCS outputs when the MCP server view is hard-deleted", async () => {
    const { authenticator, invocation, mcpServerView } = await setup();
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation,
      mcpServerView,
    });
    await action.createOutputItems(authenticator, [
      { content: { type: "text", text: "4" } },
    ]);
    expect(gcsStore.size).toBe(2);

    // The action FKs the view with RESTRICT: hard-deleting the view (e.g. sharing a server to
    // the company space, remote server deletion) must not throw.
    const deleteResult = await mcpServerView.hardDelete(authenticator);
    expect(deleteResult.isOk()).toBe(true);

    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        action.sId
      )
    ).toBeNull();
    expect(gcsStore.size).toBe(1);
  });
});
