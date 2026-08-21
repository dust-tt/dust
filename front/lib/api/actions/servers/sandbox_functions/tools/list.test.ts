import { formatSandboxFunctionsList } from "@app/lib/api/actions/servers/sandbox_functions/tools/list";
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

describe("formatSandboxFunctionsList", () => {
  it("returns an explicit empty message when there are none", () => {
    expect(formatSandboxFunctionsList([])).toBe(
      "No pod functions published in this pod."
    );
  });

  it("renders slug, mode, timestamp and description without schemas", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user by name.",
    });

    const out = formatSandboxFunctionsList([fn]);

    expect(out).toContain("Pod functions:");
    // The mode and timestamp mirror the publish tool's receipt, so a caller can confirm a
    // publish landed from the listing.
    expect(out).toContain(
      `- greet [${fn.executionMode}, updated ${fn.updatedAt.toISOString()}]: Greet a user by name.`
    );
    expect(out).toContain("Use the get tool");
    // The verbose schemas live behind the get tool, not the list.
    expect(out).not.toContain("input:");
    expect(out).not.toContain("output:");
    // Neither the bundle filename nor the internal sId is surfaced.
    expect(out).not.toContain("greet.ts");
    expect(out).not.toContain(fn.sId);
  });

  it("lists every function", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user.",
    });
    await makeFunction(authenticator, space, {
      slug: "translate-text",
      description: "Translate text.",
    });

    const fns = await SandboxFunctionResource.listBySpace(authenticator, space);
    const out = formatSandboxFunctionsList(fns);

    expect(out).toContain("greet");
    expect(out).toContain("translate-text");
  });
});
