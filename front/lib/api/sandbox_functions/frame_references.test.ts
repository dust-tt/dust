import { listFramePathsReferencingSandboxFunction } from "@app/lib/api/sandbox_functions/frame_references";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it } from "vitest";

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

async function makeFunction(
  auth: Authenticator,
  space: SpaceResource,
  { slug }: { slug: string }
): Promise<SandboxFunctionResource> {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: `${slug}.ts`,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    slug,
    description: "A function.",
    inputSchema,
    outputSchema,
  });
}

async function makeFrame(
  auth: Authenticator,
  space: SpaceResource,
  {
    fileName,
    source,
    publishedBundle,
  }: { fileName: string; source: string; publishedBundle?: string }
): Promise<FileResource> {
  const file = await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName,
    fileSize: source.length,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  await file.uploadContent(auth, source);

  if (publishedBundle !== undefined) {
    // Mirrors publishFrame: the bundle root flips the frame's content version to "processed".
    await file.setUseCaseMetadata(auth, {
      ...(file.useCaseMetadata ?? {}),
      frameBundleRootPath: `pod-${space.sId}/MyApp`,
    });
    await file.uploadProcessed(auth, publishedBundle);
  }

  return file;
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("listFramePathsReferencingSandboxFunction", () => {
  it("finds frames referencing the function by qualified reference or sId", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "myapp__list-notes",
    });

    await makeFrame(authenticator, space, {
      fileName: "Notes.tsx",
      source: `callFunction("${space.sId}/myapp__list-notes", {});`,
    });
    await makeFrame(authenticator, space, {
      fileName: "BySid.tsx",
      source: `callFunction("${fn.sId}", {});`,
    });
    await makeFrame(authenticator, space, {
      fileName: "Unrelated.tsx",
      source: `callFunction("${space.sId}/other__fn", {});`,
    });

    const framePaths = await listFramePathsReferencingSandboxFunction(
      authenticator,
      { space, sandboxFunction: fn }
    );

    expect(framePaths.sort()).toEqual([
      `pod-${space.sId}/BySid.tsx`,
      `pod-${space.sId}/Notes.tsx`,
    ]);
  });

  it("scans the rendered bundle of a published frame", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "myapp__list-notes",
    });

    // The entry source does not carry the reference (it lives in an imported module), but the
    // rendered bundle inlines every module and does.
    await makeFrame(authenticator, space, {
      fileName: "Dashboard.tsx",
      source: `import { load } from "./lib/load.ts"; export default load;`,
      publishedBundle: `var ref = "${space.sId}/myapp__list-notes";`,
    });

    const framePaths = await listFramePathsReferencingSandboxFunction(
      authenticator,
      { space, sandboxFunction: fn }
    );

    expect(framePaths).toEqual([`pod-${space.sId}/Dashboard.tsx`]);
  });

  it("ignores non-frame pod files containing the reference", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "myapp__list-notes",
    });

    const notes = await FileFactory.create(authenticator, null, {
      contentType: "text/plain",
      fileName: "notes.txt",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    await notes.uploadContent(
      authenticator,
      `mentions ${space.sId}/myapp__list-notes in prose`
    );

    const framePaths = await listFramePathsReferencingSandboxFunction(
      authenticator,
      { space, sandboxFunction: fn }
    );

    expect(framePaths).toEqual([]);
  });
});
