import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { ONBOARDING_PROFILE_PENDING_METADATA_KEY } from "@app/types/onboarding";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function completeOnboarding(body: unknown = { locale: "en-US" }) {
  return honoApp.request(`/api/user/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  it("saves the locale", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });

    const response = await completeOnboarding({ locale: "fr-FR" });

    expect(response.status).toBe(200);
    expect(await user.getStoredLocale()).toBe("fr-FR");
    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("false");
  });

  it("leaves the locale unchanged when missing", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "en-GB");

    const response = await completeOnboarding({});

    expect(response.status).toBe(200);
    expect(await user.getStoredLocale()).toBe("en-GB");
    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("false");
  });

  it("completes the onboarding for a bodyless request", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "en-GB");
    await user.setMetadata(ONBOARDING_PROFILE_PENDING_METADATA_KEY, "true");

    const response = await honoApp.request(`/api/user/onboarding/complete`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await user.getStoredLocale()).toBe("en-GB");
    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("false");
  });

  it("rejects an unsupported locale without completing the onboarding", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });
    await user.setMetadata(ONBOARDING_PROFILE_PENDING_METADATA_KEY, "true");

    const response = await completeOnboarding({ locale: "xx-XX" });

    expect(response.status).toBe(400);
    expect(await user.getStoredLocale()).toBeNull();
    const metadata = await user.getMetadata(
      ONBOARDING_PROFILE_PENDING_METADATA_KEY
    );
    expect(metadata?.value).toBe("true");
  });
});
