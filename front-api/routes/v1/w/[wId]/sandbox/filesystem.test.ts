import { randomUUID } from "node:crypto";
import { generateSandboxFileSystemToken } from "@app/lib/api/sandbox/access_tokens";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const NodeSchema = z.object({
  id: z.number(),
  rootKind: z.enum(["conversation", "pod"]),
  rootId: z.string(),
  name: z.string(),
});

async function requestFileSystem(
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
  it("moves one inode from its conversation root to its Pod root", async () => {
    const context = await createSandboxTokenTestContext();
    const pod = await SpaceFactory.project(
      context.workspace,
      context.auth.getNonNullableUser().id
    );
    const token = await generateSandboxFileSystemToken(context.auth, {
      sandbox: context.sandbox,
      conversationId: context.conversation.sId,
      spaceId: pod.sId,
    });

    const initializeResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      { operation: "initialize" }
    );
    expect(initializeResponse.status).toBe(200);
    const initialized = z
      .object({ roots: z.array(NodeSchema) })
      .parse(await initializeResponse.json());
    const conversationRoot = initialized.roots.find(
      (root) => root.rootKind === "conversation"
    );
    const podRoot = initialized.roots.find((root) => root.rootKind === "pod");
    if (!conversationRoot || !podRoot) {
      throw new Error("Expected conversation and Pod filesystem roots.");
    }

    const createResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "create",
        parentId: conversationRoot.id,
        name: "frame.tsx",
        kind: "file",
        mode: 0o644,
      }
    );
    expect(createResponse.status).toBe(200);
    const created = z
      .object({ node: NodeSchema })
      .parse(await createResponse.json());

    const renameResponse = await requestFileSystem(
      context.workspace.sId,
      token,
      {
        operation: "rename",
        requestId: randomUUID(),
        parentId: conversationRoot.id,
        name: "frame.tsx",
        newParentId: podRoot.id,
        newName: "frame.tsx",
      }
    );
    expect(renameResponse.status).toBe(200);
    const renamed = z
      .object({ node: NodeSchema })
      .parse(await renameResponse.json());
    expect(renamed.node).toMatchObject({
      id: created.node.id,
      rootKind: "pod",
      rootId: pod.sId,
      name: "frame.tsx",
    });
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
});
