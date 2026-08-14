import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { unpublishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/unpublish";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async (
      _lockName: string,
      callback: () => Promise<unknown>
    ) => callback(),
  };
});

const inputSchema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { greeting: { type: "string" } },
  required: ["greeting"],
};

beforeEach(() => {
  fileStorageMock.reset();
});

describe("unpublishHandler", () => {
  it("unpublishes a function from the current writable pod", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    expect(pod).not.toBeNull();
    if (!pod) {
      return;
    }
    const bundle = await FileFactory.create(auth, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    const sandboxFunction = await SandboxFunctionResource.makeNew(auth, {
      space: pod,
      file: bundle,
      slug: "greet",
      description: "Greet someone.",
      inputSchema,
      outputSchema,
    });

    const result = await unpublishHandler(
      { slug: "greet" },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value : null).toEqual([
      {
        type: "text",
        text: 'Unpublished pod function "greet" and deleted its invocation history.',
      },
    ]);
    await expect(
      SandboxFunctionResource.fetchById(auth, sandboxFunction.sId)
    ).resolves.toBeNull();
  });

  it("warns about pod frames that still reference the unpublished function", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    expect(pod).not.toBeNull();
    if (!pod) {
      return;
    }
    const bundle = await FileFactory.create(auth, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    await SandboxFunctionResource.makeNew(auth, {
      space: pod,
      file: bundle,
      slug: "greet",
      description: "Greet someone.",
      inputSchema,
      outputSchema,
    });
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Greeter.tsx",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    await frame.uploadContent(auth, `callFunction("${pod.sId}/greet", {});`);

    const result = await unpublishHandler(
      { slug: "greet" },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const content = result.value[0];
    expect(content?.type).toBe("text");
    if (content?.type !== "text") {
      return;
    }
    expect(content.text).toContain(
      'Unpublished pod function "greet" and deleted its invocation history.'
    );
    expect(content.text).toContain(
      "Warning: 1 frame(s) reference this function:"
    );
    expect(content.text).toContain("Greeter.tsx");
  });

  it("returns an untracked error when the slug is not published", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await unpublishHandler(
      { slug: "missing" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        'No pod function with slug "missing" in this pod.'
      );
      expect(result.error.tracked).toBe(false);
    }
  });

  it("registers unpublish as a high-stake tool with slug validation", () => {
    const metadata = SANDBOX_FUNCTIONS_TOOLS_METADATA.find(
      (tool) => tool.name === "unpublish"
    );

    expect(metadata).toBeDefined();
    expect(metadata?.stake).toBe("high");
    expect(metadata?.schema.slug.safeParse("valid-slug").success).toBe(true);
    expect(metadata?.schema.slug.safeParse("Invalid Slug").success).toBe(false);
  });
});
