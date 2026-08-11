import { formatSandboxFunction } from "@app/lib/api/actions/servers/sandbox_functions/tools/get";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

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
  { slug, description }: { slug: string; description: string }
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
    description,
    inputSchema,
    outputSchema,
  });
}

describe("formatSandboxFunction", () => {
  it("renders slug, description and the full schemas", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user by name.",
    });

    const out = formatSandboxFunction(fn);

    expect(out).toContain("greet: Greet a user by name.");
    expect(out).toContain("userIdentity: optional");
    // The serving-version fields mirror the publish tool's receipt. This function was created
    // without a hash (pre-hash publishes exist in prod), so the field must degrade explicitly.
    expect(out).toContain(`updatedAt: ${fn.updatedAt.toISOString()}`);
    expect(out).toContain("bundleSha256: null");
    expect(out).toContain(`input: ${JSON.stringify(fn.inputSchema)}`);
    expect(out).toContain(`output: ${JSON.stringify(fn.outputSchema)}`);
  });

  it("resolves a function by its slug within the pod", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user by name.",
    });

    const found = await SandboxFunctionResource.fetchBySpaceAndSlug(
      authenticator,
      space,
      "greet"
    );
    expect(found?.id).toBe(fn.id);

    const missing = await SandboxFunctionResource.fetchBySpaceAndSlug(
      authenticator,
      space,
      "does-not-exist"
    );
    expect(missing).toBeNull();
  });
});
