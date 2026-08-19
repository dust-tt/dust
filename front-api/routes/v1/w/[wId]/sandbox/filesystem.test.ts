import { randomUUID } from "node:crypto";
import { FileSystemOperationResponseSchema } from "@app/lib/api/file_system/namespace";
import { generateSandboxFileSystemToken } from "@app/lib/api/sandbox/access_tokens";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function requestFileSystem(
  workspaceId: string,
  token: string,
  operation: object
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/filesystem`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(operation),
  });
}

describe("POST /api/v1/w/[wId]/sandbox/filesystem", () => {
  it("uses only the roots and permissions signed into the token", async () => {
    const context = await createSandboxTokenTestContext();
    const pod = await SpaceFactory.project(
      context.workspace,
      context.auth.getNonNullableUser().id
    );
    const token = await generateSandboxFileSystemToken(context.auth, {
      sandbox: context.sandbox,
      roots: [
        {
          kind: "conversation",
          id: context.conversation.sId,
          permissions: { canRead: true, canWrite: true },
        },
        {
          kind: "pod",
          id: pod.sId,
          permissions: { canRead: true, canWrite: false },
        },
      ],
    });

    const initializeResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      { operation: "initialize" }
    );
    expect(initializeResponse.status).toBe(200);
    const initialized = FileSystemOperationResponseSchema.parse(
      await initializeResponse.json()
    );
    const conversationRoot = initialized.roots?.find(
      (root) => root.rootKind === "conversation"
    );
    const podRoot = initialized.roots?.find((root) => root.rootKind === "pod");
    if (!conversationRoot || !podRoot) {
      throw new Error("Expected conversation and Pod filesystem roots.");
    }

    const createResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "create",
        requestId: randomUUID(),
        parentId: conversationRoot.id,
        name: "script.sh",
        kind: "file",
        mode: 0o644,
      }
    );
    expect(createResponse.status).toBe(200);
    const created = FileSystemOperationResponseSchema.parse(
      await createResponse.json()
    );
    if (!created.node) {
      throw new Error("Expected the created file.");
    }

    const executableResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "setExecutableBits",
        nodeId: created.node.id,
        executableBits: 0o111,
      }
    );
    expect(executableResponse.status).toBe(200);
    expect(
      FileSystemOperationResponseSchema.parse(await executableResponse.json())
        .node?.mode
    ).toBe(0o755);

    const podWriteResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "create",
        requestId: randomUUID(),
        parentId: podRoot.id,
        name: "blocked.txt",
        kind: "file",
        mode: 0o644,
      }
    );
    expect(podWriteResponse.status).toBe(403);
    expect(podWriteResponse.headers.get("x-dust-filesystem-error")).toBe(
      "unauthorized"
    );
  });

  it("returns the node removed or replaced by a namespace mutation", async () => {
    const context = await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(context.auth, {
      sandbox: context.sandbox,
      roots: [
        {
          kind: "conversation",
          id: context.conversation.sId,
          permissions: { canRead: true, canWrite: true },
        },
      ],
    });
    const initializeResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      { operation: "initialize" }
    );
    const initialized = FileSystemOperationResponseSchema.parse(
      await initializeResponse.json()
    );
    const root = initialized.roots?.[0];
    if (!root) {
      throw new Error("Expected a conversation filesystem root.");
    }

    const createFile = async (name: string) => {
      const response = await requestFileSystem(context.workspace.sId, token, {
        operation: "create",
        requestId: randomUUID(),
        parentId: root.id,
        name,
        kind: "file",
        mode: 0o644,
      });
      const created = FileSystemOperationResponseSchema.parse(
        await response.json()
      );
      if (!created.node) {
        throw new Error(`Expected ${name} to be created.`);
      }
      return created.node;
    };
    const source = await createFile("source.txt");
    const destination = await createFile("destination.txt");

    const renameResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "rename",
        requestId: randomUUID(),
        sourceParentId: root.id,
        sourceName: source.name,
        destinationParentId: root.id,
        destinationName: destination.name,
      }
    );
    expect(renameResponse.status).toBe(200);
    const renamed = FileSystemOperationResponseSchema.parse(
      await renameResponse.json()
    );
    expect(renamed.node?.id).toBe(source.id);
    expect(renamed.replacedNodeId).toBe(destination.id);

    const removeResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "remove",
        requestId: randomUUID(),
        parentId: root.id,
        name: destination.name,
        kind: "file",
      }
    );
    expect(removeResponse.status).toBe(200);
    const removed = FileSystemOperationResponseSchema.parse(
      await removeResponse.json()
    );
    expect(removed.removedNodeId).toBe(source.id);
  });

  it("rejects malformed filesystem operations before running them", async () => {
    const context = await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(context.auth, {
      sandbox: context.sandbox,
      roots: [
        {
          kind: "conversation",
          id: context.conversation.sId,
          permissions: { canRead: true, canWrite: true },
        },
      ],
    });

    const response = await requestFileSystem(context.workspace.sId, token, {
      operation: "setExecutableBits",
      nodeId: 1,
      executableBits: 0o200,
    });

    expect(response.status).toBe(400);
  });

  it("rejects regular sandbox action tokens", async () => {
    const context = await createSandboxTokenTestContext();

    const response = await requestFileSystem(
      context.workspace.sId,
      context.token,
      { operation: "initialize" }
    );

    expect(response.status).toBe(403);
  });

  it("does not let filesystem tokens call sandbox action endpoints", async () => {
    const context = await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(context.auth, {
      sandbox: context.sandbox,
      roots: [
        {
          kind: "conversation",
          id: context.conversation.sId,
          permissions: { canRead: true, canWrite: true },
        },
      ],
    });

    const response = await honoApp.request(
      `/api/v1/w/${context.workspace.sId}/sandbox/actions`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    expect(response.status).toBe(403);
  });
});
