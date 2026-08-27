import { buildAndPublishFramePublication } from "@app/lib/api/frames/build_and_publish";
import { ensureConversationSandboxReadyWithScope } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/lifecycle")>();
  return { ...actual, ensureConversationSandboxReadyWithScope: vi.fn() };
});

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();
    return { ...actual, buildSandboxFunctionOnReadySandbox: vi.fn() };
  }
);

const manifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
    {
      name: "list-tasks",
      description: "List tasks.",
      entryPoint: "functions/list_tasks.ts",
    },
  ],
});

const sourceFiles = [
  {
    relativePath: "index.tsx",
    content: Buffer.from("export default function App() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "functions/add_task.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "functions/list_tasks.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
];

async function setup(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  frame: FileResource;
  sandbox: SandboxResource;
  space: SpaceResource;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "created",
    useCase: "project_context",
  });
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.spyOn(sandbox, "writeFile").mockResolvedValue(new Ok(undefined));
  vi.spyOn(sandbox, "exec").mockResolvedValue(
    new Ok({ exitCode: 0, stdout: "", stderr: "" })
  );
  vi.mocked(ensureConversationSandboxReadyWithScope).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false, scope: { spaceId: null } })
  );

  return { auth, conversation, frame, sandbox, space };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("buildAndPublishFramePublication", () => {
  it("builds every declared function before publishing", async () => {
    const { auth, conversation, frame, sandbox, space } = await setup();
    vi.mocked(ensureConversationSandboxReadyWithScope).mockResolvedValue(
      new Ok({
        sandbox,
        freshlyCreated: false,
        scope: { spaceId: space.sId },
      })
    );
    vi.mocked(buildSandboxFunctionOnReadySandbox)
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const addTask = true;",
          userIdentity: "workspace_user_required",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        })
      )
      .mockResolvedValueOnce(
        new Ok({
          bundleCode: "export const listTasks = true;",
          userIdentity: "optional",
          inputSchema: { type: "object" },
          outputSchema: { type: "array" },
        })
      );

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
      frame,
      manifest,
      sourceFiles,
    });

    expect(result.isOk()).toBe(true);
    expect(sandbox.writeFile).toHaveBeenCalledTimes(sourceFiles.length);
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenNthCalledWith(
      1,
      auth,
      {
        sandbox,
        srcSandboxPath: expect.stringMatching(
          /^\/tmp\/dust-frame-publication-builds\/[^/]+\/functions\/add_task\.ts$/
        ),
      }
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenNthCalledWith(
      2,
      auth,
      {
        sandbox,
        srcSandboxPath: expect.stringMatching(
          /^\/tmp\/dust-frame-publication-builds\/[^/]+\/functions\/list_tasks\.ts$/
        ),
      }
    );
    expect(sandbox.exec).toHaveBeenCalledWith(
      auth,
      expect.stringMatching(
        /^rm -rf -- '\/tmp\/dust-frame-publication-builds\/[^/]+'$/
      ),
      { user: "agent-proxied" }
    );
    expect(ensureConversationSandboxReadyWithScope).toHaveBeenCalledOnce();
    expect(
      fileStorageMock.saveFileCalls.filter(({ filePath }) =>
        filePath.endsWith("/bundle.js")
      )
    ).toHaveLength(2);

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.isOk() ? result.value.publicationId : undefined
    );
  });

  it("does not write a publication when a function build fails", async () => {
    const { auth, conversation, frame } = await setup();
    vi.mocked(buildSandboxFunctionOnReadySandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "Invalid export."))
    );

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
      frame,
      manifest,
      sourceFiles,
    });

    expect(result.isErr() && result.error).toEqual(
      new SandboxFunctionError(
        "build_failed",
        'Failed to build Frame function "add-task": Invalid export.'
      )
    );
    expect(buildSandboxFunctionOnReadySandbox).toHaveBeenCalledTimes(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBeUndefined();
  });

  it("rejects an unsafe snapshot path before staging or building", async () => {
    const { auth, conversation, frame, sandbox } = await setup();

    const result = await buildAndPublishFramePublication(auth, {
      conversation,
      frame,
      manifest,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "../outside.ts",
          content: Buffer.from("export const outside = true;"),
          contentType: "text/typescript",
        },
      ],
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(ensureConversationSandboxReadyWithScope).not.toHaveBeenCalled();
    expect(sandbox.writeFile).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnReadySandbox).not.toHaveBeenCalled();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
