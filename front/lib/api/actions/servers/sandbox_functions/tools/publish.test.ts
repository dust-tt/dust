import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { publishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import type { Authenticator } from "@app/lib/auth";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();

    return { ...actual, buildSandboxFunctionOnSandbox: vi.fn() };
  }
);

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
  vi.clearAllMocks();
  fileStorageMock.reset();
  vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
    new Ok({
      bundleCode: "export default {};",
      userIdentity: "optional",
      inputSchema,
      outputSchema,
    })
  );
});

async function makeReferencingFrame(
  auth: Authenticator,
  projectId: string,
  slug: string
): Promise<void> {
  const frame = await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: "Tasks.tsx",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: projectId },
  });
  await frame.uploadContent(auth, `callFunction("${projectId}/${slug}", {});`);
}

describe("publishHandler", () => {
  it("reports the app-prefixed slug and the reference a Frame needs", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await publishHandler(
      {
        slug: "add-task",
        description: "Add a task.",
        path: `pod-${projectId}/TaskList/functions/add-task.ts`,
        executionMode: "fast",
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: `Published pod function "tasklist__add-task". Frames call it by reference "${projectId}/tasklist__add-task".`,
      },
    ]);
  });

  it("warns about referencing frames when a republish changes the input schema", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const extra = makeExtra(auth, conversation);
    const publishParams = {
      slug: "add-task",
      description: "Add a task.",
      path: `pod-${projectId}/TaskList/functions/add-task.ts`,
      executionMode: "fast" as const,
    };

    const first = await publishHandler(publishParams, extra);
    if (first.isErr()) {
      throw first.error;
    }
    await makeReferencingFrame(auth, projectId, "tasklist__add-task");

    // Same schema: republish stays silent.
    const unchanged = await publishHandler(publishParams, extra);
    if (unchanged.isErr()) {
      throw unchanged.error;
    }
    const unchangedContent = unchanged.value[0];
    expect(unchangedContent?.type).toBe("text");
    if (unchangedContent?.type !== "text") {
      return;
    }
    expect(unchangedContent.text).not.toContain("Warning");

    // Changed input schema: the referencing frame is called out.
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "optional",
        inputSchema: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
        },
        outputSchema,
      })
    );
    const changed = await publishHandler(publishParams, extra);
    if (changed.isErr()) {
      throw changed.error;
    }
    const changedContent = changed.value[0];
    expect(changedContent?.type).toBe("text");
    if (changedContent?.type !== "text") {
      return;
    }
    expect(changedContent.text).toContain(
      'Published pod function "tasklist__add-task".'
    );
    expect(changedContent.text).toContain(
      "Warning: the input schema changed and 1 frame(s) reference this function:"
    );
    expect(changedContent.text).toContain("Tasks.tsx");
  });

  it("accepts a bare function name but not one that already carries a prefix", () => {
    const metadata = SANDBOX_FUNCTIONS_TOOLS_METADATA.find(
      (tool) => tool.name === "publish"
    );

    expect(metadata).toBeDefined();
    expect(metadata?.schema.slug.safeParse("add-task").success).toBe(true);
    // Publish derives the prefix from `path`, so the caller must not supply one.
    expect(metadata?.schema.slug.safeParse("tasklist__add-task").success).toBe(
      false
    );
    expect(metadata?.schema.slug.safeParse("Add Task").success).toBe(false);
  });
});
