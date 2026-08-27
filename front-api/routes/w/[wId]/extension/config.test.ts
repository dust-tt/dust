import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { EXTENSION_LAST_USED_AT_METADATA_KEY } from "@app/types/extension";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/extension/config", () => {
  it("records the latest extension use date without relying on Origin", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();
    await user.setMetadata(
      EXTENSION_LAST_USED_AT_METADATA_KEY,
      "2026-01-01T00:00:00.000Z"
    );
    const beforeRequestMs = Date.now();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/extension/config`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blacklistedDomains: [] });

    const metadata = await user.getMetadata(
      EXTENSION_LAST_USED_AT_METADATA_KEY
    );
    const lastUsedAtMs = Date.parse(metadata?.value ?? "");
    expect(lastUsedAtMs).toBeGreaterThanOrEqual(beforeRequestMs);
    expect(lastUsedAtMs).toBeLessThanOrEqual(Date.now());
  });
});
