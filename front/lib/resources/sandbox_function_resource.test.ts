import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

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
        inputSchema,
        outputSchema,
      }
    );

    expect(sandboxFunction.sId).toMatch(/^sfn_/);
    expect(sandboxFunction.spaceId).toBe(space.id);
    expect(sandboxFunction.fileId).toBe(file.id);
    expect(sandboxFunction.inputSchema).toEqual(inputSchema);
    expect(sandboxFunction.outputSchema).toEqual(outputSchema);

    const fetched = await SandboxFunctionResource.fetchById(
      authenticator,
      sandboxFunction.sId
    );
    expect(fetched?.id).toBe(sandboxFunction.id);
    expect(fetched?.space.id).toBe(space.id);

    const listed = await SandboxFunctionResource.listBySpace(
      authenticator,
      space
    );
    expect(listed.map(({ id }) => id)).toEqual([sandboxFunction.id]);
    expect(listed.map(({ space }) => space.id)).toEqual([space.id]);
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
        inputSchema,
        outputSchema,
      }
    );
    const restrictedSandboxFunction = await SandboxFunctionResource.makeNew(
      adminAuth,
      {
        space: restrictedSpace,
        file: restrictedFile,
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
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow("Sandbox functions can only belong to project spaces.");
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
        inputSchema: { type: "number", multipleOf: 0 },
        outputSchema,
      })
    ).rejects.toThrow("Invalid JSON schema");
  });

  it("declares a unique file index", () => {
    expect(SandboxFunctionModel.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ["fileId"],
          unique: true,
        }),
      ])
    );
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
