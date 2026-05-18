import {
  createToolManifest,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("getToolsForProvider", () => {
  it("filters dsbx from manifest inputs when requested", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const hiddenToolsResult = getToolsForProvider(auth, "openai", {
      includeDsbxTools: false,
    });
    expect(hiddenToolsResult.isOk()).toBe(true);

    if (hiddenToolsResult.isErr()) {
      throw hiddenToolsResult.error;
    }

    const hiddenManifest = toolManifestToYAML(
      createToolManifest(hiddenToolsResult.value)
    );
    expect(hiddenManifest).not.toContain("name: dsbx");

    const visibleToolsResult = getToolsForProvider(auth, "openai", {
      includeDsbxTools: true,
    });
    expect(visibleToolsResult.isOk()).toBe(true);

    if (visibleToolsResult.isErr()) {
      throw visibleToolsResult.error;
    }

    const visibleManifest = toolManifestToYAML(
      createToolManifest(visibleToolsResult.value)
    );
    expect(visibleManifest).toContain("name: dsbx");
  });
});
