import { generateSandboxFunctionInvocationToken } from "@app/lib/api/sandbox/access_tokens";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import {
  SandboxFunctionInvocationModel,
  SandboxFunctionModel,
} from "@app/lib/resources/storage/models/sandbox_function";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/access_tokens", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/access_tokens")>();

  return {
    ...actual,
    generateSandboxFunctionInvocationToken: vi.fn(),
  };
});

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    commentId: { type: "string" },
  },
  required: ["commentId"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SandboxFunctionResource", () => {
  it("creates and fetches a sandbox function for a space", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        space,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      }
    );

    expect(sandboxFunction.sId).toMatch(/^sfn_/);
    expect(sandboxFunction.spaceId).toBe(space.id);
    expect(sandboxFunction.fileId).toBe(file.id);
    expect(sandboxFunction.slug).toBe("add-comment");
    expect(sandboxFunction.description).toBe("Add a comment.");
    expect(sandboxFunction.inputSchema).toEqual(inputSchema);
    expect(sandboxFunction.outputSchema).toEqual(outputSchema);
    expect(sandboxFunction.file.id).toBe(file.id);

    const fetched = await SandboxFunctionResource.fetchById(
      authenticator,
      sandboxFunction.sId
    );
    expect(fetched?.id).toBe(sandboxFunction.id);
    expect(fetched?.slug).toBe("add-comment");
    expect(fetched?.description).toBe("Add a comment.");
    expect(fetched?.space.id).toBe(space.id);
    expect(fetched?.file.id).toBe(file.id);

    const listed = await SandboxFunctionResource.listBySpace(
      authenticator,
      space
    );
    expect(listed.map(({ id }) => id)).toEqual([sandboxFunction.id]);
    expect(listed.map(({ space }) => space.id)).toEqual([space.id]);
    expect(listed.map(({ file }) => file.id)).toEqual([file.id]);
  });

  it("only fetches sandbox functions from accessible spaces", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const accessibleSpace = await SpaceFactory.project(workspace);
    const restrictedSpace = await SpaceFactory.project(workspace);
    const accessibleFile = await FileFactory.create(adminAuth, null, {
      contentType: sandboxFunctionContentType,
      fileName: "accessible.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: accessibleSpace.sId },
    });
    const restrictedFile = await FileFactory.create(adminAuth, null, {
      contentType: sandboxFunctionContentType,
      fileName: "restricted.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: restrictedSpace.sId },
    });
    const accessibleSandboxFunction = await SandboxFunctionResource.makeNew(
      adminAuth,
      {
        space: accessibleSpace,
        file: accessibleFile,
        slug: "fetch-accessible",
        description: "Fetch accessible data.",
        inputSchema,
        outputSchema,
      }
    );
    const restrictedSandboxFunction = await SandboxFunctionResource.makeNew(
      adminAuth,
      {
        space: restrictedSpace,
        file: restrictedFile,
        slug: "fetch-restricted",
        description: "Fetch restricted data.",
        inputSchema,
        outputSchema,
      }
    );

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const addMemberResult =
      await accessibleSpace.groups[0].dangerouslyAddMember(adminAuth, {
        user: user.toJSON(),
      });
    expect(addMemberResult.isOk()).toBe(true);

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(userAuth).not.toBeNull();
    if (!userAuth) {
      return;
    }

    await expect(
      SandboxFunctionResource.fetchById(userAuth, accessibleSandboxFunction.sId)
    ).resolves.toMatchObject({
      id: accessibleSandboxFunction.id,
      space: expect.objectContaining({ id: accessibleSpace.id }),
      file: expect.objectContaining({ id: accessibleFile.id }),
    });
    await expect(
      SandboxFunctionResource.fetchById(userAuth, restrictedSandboxFunction.sId)
    ).resolves.toBeNull();

    const accessibleList = await SandboxFunctionResource.listBySpace(
      userAuth,
      accessibleSpace
    );
    expect(accessibleList.map(({ id }) => id)).toEqual([
      accessibleSandboxFunction.id,
    ]);
    expect(accessibleList.map(({ space }) => space.id)).toEqual([
      accessibleSpace.id,
    ]);
    expect(accessibleList.map(({ file }) => file.id)).toEqual([
      accessibleFile.id,
    ]);

    await expect(
      SandboxFunctionResource.listBySpace(userAuth, restrictedSpace)
    ).resolves.toEqual([]);

    await expect(
      SandboxFunctionResource.fetchById(
        adminAuth,
        restrictedSandboxFunction.sId
      )
    ).resolves.toMatchObject({
      id: restrictedSandboxFunction.id,
      space: expect.objectContaining({ id: restrictedSpace.id }),
      file: expect.objectContaining({ id: restrictedFile.id }),
    });
  });

  it("rejects a non-project space", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: regularSpace.sId },
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        space: regularSpace,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow("Sandbox functions can only belong to pods.");
  });

  it("rejects a malformed slug", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        space,
        file,
        slug: "Not A Slug",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow("The slug must be lowercase");
  });

  it("rejects a duplicate slug in the same pod", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const makeFile = (fileName: string) =>
      FileFactory.create(authenticator, null, {
        contentType: sandboxFunctionContentType,
        fileName,
        fileSize: 100,
        status: "created",
        useCase: "project_context",
        useCaseMetadata: { spaceId: space.sId },
      });

    await SandboxFunctionResource.makeNew(authenticator, {
      space,
      file: await makeFile("first.ts"),
      slug: "greet",
      description: "First greet.",
      inputSchema,
      outputSchema,
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        space,
        file: await makeFile("second.ts"),
        slug: "greet",
        description: "Second greet.",
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow();
  });

  it("rejects a file outside project context", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "conversation",
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        space,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow("The file must use the project_context use case.");
  });

  it("rejects an invalid JSON Schema", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        space,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema: { type: "number", multipleOf: 0 },
        outputSchema,
      })
    ).rejects.toThrow("Invalid JSON schema");
  });

  it("declares unique file and slug indexes", () => {
    expect(SandboxFunctionModel.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ["fileId"],
          unique: true,
        }),
        expect.objectContaining({
          fields: ["workspaceId", "spaceId", "slug"],
          unique: true,
        }),
      ])
    );
  });

  it("invokes the function on the pod sandbox", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        space,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      }
    );
    const sandbox = await SandboxResource.makeNew(authenticator, {
      providerId: "test-provider-id",
      status: "running",
      baseImage: "dust-base",
      version: "0.0.0-test",
    });
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: "hello world\n",
        stderr: "",
      })
    );
    vi.mocked(ensurePodSandboxReady).mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );
    vi.mocked(generateSandboxFunctionInvocationToken).mockResolvedValue(
      "sbt-function-token"
    );
    const result = await sandboxFunction.invoke(authenticator, {
      input: { message: "hello" },
      context: { frameFileId: file.sId },
    });

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toMatchObject({
      functionId: sandboxFunction.sId,
      status: "created",
    });
    expect(result.value.sId).toMatch(/^sfi_/);
    expect(Date.parse(result.value.createdAt)).not.toBeNaN();
    const invocation = await SandboxFunctionInvocationModel.findOne({
      where: {
        workspaceId: workspace.id,
        sandboxFunctionId: sandboxFunction.id,
      },
    });
    expect(invocation).not.toBeNull();
    expect(invocation?.status).toBe("created");
    expect(ensurePodSandboxReady).toHaveBeenCalledWith(authenticator, space);
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      {
        sandbox,
        sandboxFunction,
        invocationId: result.value.sId,
        execId: expect.any(String),
      }
    );
    expect(execSpy).toHaveBeenCalledTimes(1);

    const execCall = execSpy.mock.calls[0];
    expect(execCall).toBeDefined();
    if (!execCall) {
      return;
    }
    const [, command, opts] = execCall;
    const stagedFunctionsDir = `/tmp/dust-sandbox-functions/${result.value.sId}`;
    expect(command).toContain(
      `cat > '${stagedFunctionsDir}/add-comment.ts' <<'DUST_SANDBOX_FUNCTION_EOF'`
    );
    expect(command).toContain("async fetch(_req: Request): Promise<Response>");
    expect(command).toContain("return Response.json({ ok: true });");
    expect(command).toContain("/opt/bin/dsbx function run 'add-comment'");
    expect(opts?.envVars).toMatchObject({
      DUST_FUNCTIONS_DIR: stagedFunctionsDir,
      DUST_SANDBOX_TOKEN: "sbt-function-token",
    });
    expect(opts?.user).toBe("agent-proxied");
    expect(opts?.workingDirectory).toBe("/home/agent");
    expect(typeof opts?.stdin).toBe("string");
    if (typeof opts?.stdin !== "string") {
      return;
    }
    const inputEnvelope = JSON.parse(opts.stdin);
    expect(inputEnvelope).toMatchObject({
      method: "POST",
      url: `https://dust.local/sandbox-functions/${sandboxFunction.sId}/invocations/${result.value.sId}`,
      headers: {
        "content-type": "application/json",
        "x-dust-frame-file-id": file.sId,
        "x-dust-sandbox-function-id": sandboxFunction.sId,
        "x-dust-sandbox-function-invocation-id": result.value.sId,
      },
      body: JSON.stringify({ message: "hello" }),
      encoding: "utf8",
    });
  });

  it("deletes all sandbox functions for a space", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        space,
        file,
        slug: "add-comment",
        description: "Add a comment.",
        inputSchema,
        outputSchema,
      }
    );

    const deleteResult = await SandboxFunctionResource.deleteAllForSpace(
      authenticator,
      space
    );

    expect(deleteResult.isOk()).toBe(true);
    expect(deleteResult.isOk() ? deleteResult.value : undefined).toBe(1);

    await expect(
      SandboxFunctionResource.fetchById(authenticator, sandboxFunction.sId)
    ).resolves.toBeNull();
    await expect(
      FileResource.fetchById(authenticator, file.sId)
    ).resolves.toBeNull();
  });

  it("refuses to delete when the user cannot access the space", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(adminAuth, null, {
      contentType: sandboxFunctionContentType,
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    const sandboxFunction = await SandboxFunctionResource.makeNew(adminAuth, {
      space,
      file,
      slug: "add-comment",
      description: "Add a comment.",
      inputSchema,
      outputSchema,
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(userAuth).not.toBeNull();
    if (!userAuth) {
      return;
    }

    const deleteResult = await sandboxFunction.delete(userAuth);

    expect(deleteResult.isErr()).toBe(true);
    expect(deleteResult.isErr() ? deleteResult.error.message : null).toBe(
      "Sandbox function space is not accessible."
    );
    await expect(
      SandboxFunctionResource.fetchById(adminAuth, sandboxFunction.sId)
    ).resolves.toMatchObject({ id: sandboxFunction.id });
  });
});
