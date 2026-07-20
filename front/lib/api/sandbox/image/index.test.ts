import {
  createToolManifest,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("getToolsForProvider", () => {
  it("includes dsbx in manifest inputs", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const toolsResult = getToolsForProvider(auth, "openai");
    expect(toolsResult.isOk()).toBe(true);

    if (toolsResult.isErr()) {
      throw toolsResult.error;
    }

    const manifest = toolManifestToYAML(createToolManifest(toolsResult.value));
    expect(manifest).toContain("name: dsbx");
  });
});
