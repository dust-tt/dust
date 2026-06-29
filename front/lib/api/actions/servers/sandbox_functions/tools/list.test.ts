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
  fileName: string
): Promise<SandboxFunctionResource> {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    inputSchema,
    outputSchema,
  });
}

describe("formatSandboxFunctionsList", () => {
  it("returns an explicit empty message when there are none", () => {
    expect(formatSandboxFunctionsList([])).toBe(
      "No sandbox functions published in this pod."
    );
  });

  it("renders name, sId and schemas for a function", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, "greet.ts");

    const out = formatSandboxFunctionsList([fn]);

    expect(out).toContain("Sandbox functions:");
    expect(out).toContain(`- greet.ts (${fn.sId})`);
    expect(fn.sId).toMatch(/^sfn_/);
    expect(out).toContain(`input: ${JSON.stringify(fn.inputSchema)}`);
    expect(out).toContain(`output: ${JSON.stringify(fn.outputSchema)}`);
  });

  it("lists every function", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    await makeFunction(authenticator, space, "greet.ts");
    await makeFunction(authenticator, space, "farewell.ts");

    const fns = await SandboxFunctionResource.listBySpace(authenticator, space);
    const out = formatSandboxFunctionsList(fns);

    expect(out).toContain("greet.ts");
    expect(out).toContain("farewell.ts");
  });
});
