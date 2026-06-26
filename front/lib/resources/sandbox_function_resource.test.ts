import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
  it("creates and fetches a sandbox function for a Pod", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: "text/typescript",
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "sandbox_function",
    });

    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        pod,
        file,
        inputSchema,
        outputSchema,
      }
    );

    expect(sandboxFunction.sId).toMatch(/^sfn_/);
    expect(sandboxFunction.podId).toBe(pod.id);
    expect(sandboxFunction.fileId).toBe(file.id);
    expect(sandboxFunction.inputSchema).toEqual(inputSchema);
    expect(sandboxFunction.outputSchema).toEqual(outputSchema);

    const fetched = await SandboxFunctionResource.fetchById(
      authenticator,
      sandboxFunction.sId
    );
    expect(fetched?.id).toBe(sandboxFunction.id);

    const listed = await SandboxFunctionResource.listByPod(authenticator, pod);
    expect(listed.map(({ id }) => id)).toEqual([sandboxFunction.id]);
  });

  it("rejects a non-Pod space", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: "text/typescript",
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "sandbox_function",
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        pod: regularSpace,
        file,
        inputSchema,
        outputSchema,
      })
    ).rejects.toThrow("Sandbox functions can only belong to Pod spaces.");
  });

  it("rejects an invalid JSON Schema", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: "text/typescript",
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "sandbox_function",
    });

    await expect(
      SandboxFunctionResource.makeNew(authenticator, {
        pod,
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

  it("deletes all sandbox functions for a Pod", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const file = await FileFactory.create(authenticator, null, {
      contentType: "text/typescript",
      fileName: "comments.ts",
      fileSize: 100,
      status: "created",
      useCase: "sandbox_function",
    });
    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        pod,
        file,
        inputSchema,
        outputSchema,
      }
    );

    await SandboxFunctionResource.deleteAllForPod(authenticator, pod);

    await expect(
      SandboxFunctionResource.fetchById(authenticator, sandboxFunction.sId)
    ).resolves.toBeNull();
    await expect(
      FileResource.fetchById(authenticator, file.sId)
    ).resolves.toBeNull();
  });
});
