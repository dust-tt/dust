import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  SandboxFunctionInvocationModel,
  SandboxFunctionModel,
} from "@app/lib/resources/storage/models/sandbox_function";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { SandboxFunctionStake } from "@app/types/api/sandbox_functions";
import { DEFAULT_SANDBOX_FUNCTION_STAKE } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeWithLockMock = vi.hoisted(() =>
  vi.fn(async (_lockName: string, callback: () => Promise<unknown>) =>
    callback()
  )
);

vi.mock("@app/lib/lock", () => ({
  executeWithLock: executeWithLockMock,
}));

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
  fileStorageMock.reset();
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
    const [accessibleGroup] =
      await accessibleSpace.fetchRegularAutoGroups(adminAuth);
    if (!accessibleGroup) {
      throw new Error("Expected a regular group on the accessible space");
    }
    const addMemberResult = await accessibleGroup.dangerouslyAddMember(
      adminAuth,
      {
        user: user.toJSON(),
      }
    );
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

  it("declares legacy and publication-scoped uniqueness indexes", () => {
    const indexes = SandboxFunctionModel.options.indexes ?? [];

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ["fileId"],
        }),
        expect.objectContaining({
          fields: ["workspaceId", "spaceId", "fileId"],
          unique: true,
        }),
        expect.objectContaining({
          fields: ["workspaceId", "spaceId", "slug"],
          unique: true,
        }),
        expect.objectContaining({
          fields: ["workspaceId", "fileId", "publicationId", "slug"],
          unique: true,
        }),
      ])
    );

    const fileIndex = indexes.find((index) => {
      const fields = index.fields ?? [];
      return fields.length === 1 && fields[0] === "fileId";
    });
    expect(fileIndex?.unique).not.toBe(true);
  });

  it("overwrites the bundle and contract in place on re-publish", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);

    const firstFile = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    await firstFile.uploadContent(authenticator, "v1");

    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        space,
        file: firstFile,
        slug: "greet",
        description: "First.",
        inputSchema,
        outputSchema,
      }
    );
    const firstVersion = firstFile.version;

    const newInputSchema: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    const newOutputSchema: JSONSchema = {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    };

    const result = await sandboxFunction.updateContent(authenticator, {
      bundleCode: "v2",
      description: "Second.",
      inputSchema: newInputSchema,
      outputSchema: newOutputSchema,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    // The row was created without a hash (pre-hash publish), so nothing can match: the
    // re-publish must not be reported as byte-identical.
    expect(result.value.byteIdentical).toBe(false);

    // The row keeps the same bundle file and gets the refreshed contract.
    expect(sandboxFunction.fileId).toBe(firstFile.id);
    expect(sandboxFunction.description).toBe("Second.");
    expect(sandboxFunction.inputSchema).toEqual(newInputSchema);
    expect(sandboxFunction.outputSchema).toEqual(newOutputSchema);
    expect(sandboxFunction.file.id).toBe(firstFile.id);
    // Re-upload bumped the bundle's version rather than creating a new file.
    expect(sandboxFunction.file.version).toBeGreaterThan(firstVersion);

    // Exactly one row and one (reused) bundle file remain.
    const listed = await SandboxFunctionResource.listBySpace(
      authenticator,
      space
    );
    expect(listed.map(({ id }) => id)).toEqual([sandboxFunction.id]);
    await expect(
      FileResource.fetchById(authenticator, firstFile.sId)
    ).resolves.not.toBeNull();

    const fetched = await SandboxFunctionResource.fetchById(
      authenticator,
      sandboxFunction.sId
    );
    expect(fetched?.fileId).toBe(firstFile.id);
    expect(fetched?.description).toBe("Second.");
    expect(fetched?.outputSchema).toEqual(newOutputSchema);
  });

  it("locks re-publish and persists a stricter policy before replacing the bundle", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
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
        slug: "greet",
        description: "First.",
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      }
    );
    vi.spyOn(sandboxFunction.file, "uploadContent").mockRejectedValueOnce(
      new Error("upload failed")
    );

    const result = await sandboxFunction.updateContent(authenticator, {
      bundleCode: "v2",
      description: "Second.",
      userIdentity: "workspace_user_required",
      inputSchema,
      outputSchema,
    });

    expect(result.isErr()).toBe(true);
    expect(executeWithLockMock).toHaveBeenCalledWith(
      `sandbox_function:publish:${sandboxFunction.sId}`,
      expect.any(Function),
      30_000,
      { lockTtlMs: 300_000 }
    );
    const fetched = await SandboxFunctionResource.fetchById(
      authenticator,
      sandboxFunction.sId
    );
    expect(fetched?.userIdentity).toBe("workspace_user_required");
    expect(fetched?.description).toBe("First.");
  });

  it("defaults the stake, stores a declared one, and restates it on re-publish", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);

    const makeFunction = async (
      fileName: string,
      slug: string,
      defaultStake?: SandboxFunctionStake
    ) => {
      const file = await FileFactory.create(authenticator, null, {
        contentType: sandboxFunctionContentType,
        fileName,
        fileSize: 100,
        status: "created",
        useCase: "project_context",
        useCaseMetadata: { spaceId: space.sId },
      });

      return SandboxFunctionResource.makeNew(authenticator, {
        space,
        file,
        slug,
        description: "First.",
        defaultStake,
        inputSchema,
        outputSchema,
      });
    };

    const unstated = await makeFunction("unstated.ts", "unstated");
    expect(unstated.defaultStake).toBe(DEFAULT_SANDBOX_FUNCTION_STAKE);

    const declared = await makeFunction("declared.ts", "declared", "never_ask");
    expect(declared.defaultStake).toBe("never_ask");

    const raised = await declared.updateContent(authenticator, {
      bundleCode: "v2",
      description: "Second.",
      defaultStake: "high",
      inputSchema,
      outputSchema,
    });
    expect(raised.isOk()).toBe(true);
    expect(
      (await SandboxFunctionResource.fetchById(authenticator, declared.sId))
        ?.defaultStake
    ).toBe("high");

    // Restated, not carried forward: a re-publish that names no stake falls back to the default
    // rather than keeping the `high` above, the same rule the execution mode follows.
    const unstatedRepublish = await declared.updateContent(authenticator, {
      bundleCode: "v3",
      description: "Third.",
      inputSchema,
      outputSchema,
    });
    expect(unstatedRepublish.isOk()).toBe(true);
    expect(
      (await SandboxFunctionResource.fetchById(authenticator, declared.sId))
        ?.defaultStake
    ).toBe(DEFAULT_SANDBOX_FUNCTION_STAKE);
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
    const invocation = await SandboxFunctionInvocationModel.create({
      workspaceId: workspace.id,
      sandboxFunctionId: sandboxFunction.id,
      status: "created",
      gcsPath: "sandbox-function-invocations/test-invocation",
    });

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
    await expect(
      SandboxFunctionInvocationModel.findOne({
        where: {
          id: invocation.id,
          workspaceId: workspace.id,
        },
      })
    ).resolves.toBeNull();
  });

  it("deletes all sandbox functions for a soft-deleted space", async () => {
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
    await SandboxFunctionResource.makeNew(authenticator, {
      space,
      file,
      slug: "add-comment",
      description: "Add a comment.",
      inputSchema,
      outputSchema,
    });

    // The pod is soft-deleted before the scrub runs, exactly as the poke deletion workflow does.
    const softDeleteResult = await space.delete(authenticator, {
      hardDelete: false,
    });
    expect(softDeleteResult.isOk()).toBe(true);
    const deletedSpace = await SpaceResource.fetchById(
      authenticator,
      space.sId,
      { includeDeleted: true }
    );
    assert(deletedSpace);

    const deleteResult = await SandboxFunctionResource.deleteAllForSpace(
      authenticator,
      deletedSpace
    );

    expect(deleteResult.isOk()).toBe(true);
    expect(deleteResult.isOk() ? deleteResult.value : undefined).toBe(1);
    await expect(
      SandboxFunctionModel.count({
        where: { spaceId: space.id, workspaceId: workspace.id },
      })
    ).resolves.toBe(0);
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

  it("counts a Frame's functions from its active publication only", async () => {
    const { adminAuth, frame } = await makeTestFrameFunction();

    // Simulates a stale prior publish: its function rows remain in the table (they are never
    // pruned), but they must not be counted once a newer publication is active.
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        adminAuth,
        {
          frame,
          publicationId: "publication-0",
          functions: [
            {
              name: "stale-function",
              description: "A function from a superseded publication.",
              userIdentity: "optional",
              executionMode: "durable",
              defaultStake: "low",
              bundleCode:
                "export default { fetch: async () => Response.json({}) };",
              inputSchema,
              outputSchema,
            },
          ],
        },
        transaction
      )
    );

    const counts = await SandboxFunctionResource.countByFrameModelIds(
      adminAuth,
      [{ frameModelId: frame.id, activePublicationId: "publication-1" }]
    );

    expect(counts.get(frame.id)).toBe(1);
  });

  it("returns an empty map for a frame with no active publication, without querying", async () => {
    const findAllSpy = vi.spyOn(SandboxFunctionModel, "findAll");
    const { authenticator } = await createResourceTest({ role: "admin" });

    const counts = await SandboxFunctionResource.countByFrameModelIds(
      authenticator,
      [{ frameModelId: 1, activePublicationId: null }]
    );

    expect(counts.size).toBe(0);
    expect(findAllSpy).not.toHaveBeenCalled();
  });
});
