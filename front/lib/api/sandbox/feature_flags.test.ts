import { hasDsbxToolsEnabled } from "@app/lib/api/sandbox/feature_flags";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("hasDsbxToolsEnabled", () => {
  it("requires both sandbox flags", async () => {
    const noFlags = await createResourceTest({});
    expect(await hasDsbxToolsEnabled(noFlags.authenticator)).toBe(false);

    const dsbxOnly = await createResourceTest({});
    await FeatureFlagFactory.basic(
      dsbxOnly.authenticator,
      "sandbox_dsbx_tools"
    );
    expect(await hasDsbxToolsEnabled(dsbxOnly.authenticator)).toBe(false);

    const bothFlags = await createResourceTest({});
    await FeatureFlagFactory.basic(bothFlags.authenticator, "sandbox_tools");
    await FeatureFlagFactory.basic(
      bothFlags.authenticator,
      "sandbox_dsbx_tools"
    );
    expect(await hasDsbxToolsEnabled(bothFlags.authenticator)).toBe(true);
  });
});
