import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { CHROME_EXTENSION_LAST_USED_AT_METADATA_KEY } from "@app/types/extension";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const CHROME_EXTENSION_ORIGIN =
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn";

describe("GET /api/w/:wId/extension/config", () => {
  it("records the latest Chrome extension use date", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();
    await user.setMetadata(
      CHROME_EXTENSION_LAST_USED_AT_METADATA_KEY,
      "2026-01-01T00:00:00.000Z"
    );
    const beforeRequestMs = Date.now();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/extension/config`,
      { headers: { origin: CHROME_EXTENSION_ORIGIN } }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blacklistedDomains: [] });

    const metadata = await user.getMetadata(
      CHROME_EXTENSION_LAST_USED_AT_METADATA_KEY
    );
    const lastUsedAtMs = Date.parse(metadata?.value ?? "");
    expect(lastUsedAtMs).toBeGreaterThanOrEqual(beforeRequestMs);
    expect(lastUsedAtMs).toBeLessThanOrEqual(Date.now());
  });

  it("does not record Firefox extension activity", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/extension/config`,
      { headers: { origin: "moz-extension://dust" } }
    );

    expect(response.status).toBe(200);
    expect(
      await user.getMetadata(CHROME_EXTENSION_LAST_USED_AT_METADATA_KEY)
    ).toBeNull();
  });
});
