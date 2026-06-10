import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ONBOARDING_PROFILE_PENDING_METADATA_KEY } from "@app/types/onboarding";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function completeOnboarding() {
  return honoApp.request(`/api/user/onboarding/complete`, {
    method: "POST",
  });
}

describe("POST /api/user/onboarding/complete", () => {
  it("clears the profile onboarding pending marker", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });

    await user.setMetadata(ONBOARDING_PROFILE_PENDING_METADATA_KEY, "true");

    const response = await completeOnboarding();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("false");
  });

  it("succeeds when no marker was set", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });

    const response = await completeOnboarding();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("false");
  });
});
