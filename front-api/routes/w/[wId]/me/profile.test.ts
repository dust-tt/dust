import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { PatchMyProfileResponseBody } from "@app/types/api/user_profile";
import { MAX_JOB_TITLE_LENGTH } from "@app/types/api/user_profile";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchMyProfile(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/me/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/me/profile", () => {
  it("returns 403 when user_profile is disabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await patchMyProfile(workspace.sId, {
      pronouns: "she/her",
      jobTitle: null,
    });

    expect(response.status).toBe(403);
  });

  it("stores trimmed pronouns and job title, and clears them with null", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");

    const response = await patchMyProfile(workspace.sId, {
      pronouns: " she/her ",
      jobTitle: "Software Engineer",
    });

    expect(response.status).toBe(200);
    const { profile }: PatchMyProfileResponseBody = await response.json();
    expect(profile.pronouns).toBe("she/her");
    expect(profile.jobTitle).toBe("Software Engineer");

    const cleared = await patchMyProfile(workspace.sId, {
      pronouns: null,
      jobTitle: null,
    });
    const { profile: clearedProfile }: PatchMyProfileResponseBody =
      await cleared.json();
    expect(clearedProfile.pronouns).toBeNull();
    expect(clearedProfile.jobTitle).toBeNull();
  });

  it("keeps a job title managed by the identity provider read-only", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");
    await auth
      .getNonNullableUser()
      .setMetadata(
        "workos:job_title",
        "Account Executive",
        auth.getNonNullableWorkspace().id
      );

    const override = await patchMyProfile(workspace.sId, {
      pronouns: null,
      jobTitle: "CEO",
    });
    expect(override.status).toBe(400);

    // Pronouns can still be saved when the job title is omitted.
    const response = await patchMyProfile(workspace.sId, {
      pronouns: "they/them",
    });
    expect(response.status).toBe(200);
    const { profile }: PatchMyProfileResponseBody = await response.json();
    expect(profile.pronouns).toBe("they/them");
    expect(profile.jobTitle).toBe("Account Executive");
    expect(profile.isJobTitleManaged).toBe(true);
  });

  it("rejects a job title over the length limit", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");

    const response = await patchMyProfile(workspace.sId, {
      pronouns: null,
      jobTitle: "a".repeat(MAX_JOB_TITLE_LENGTH + 1),
    });

    expect(response.status).toBe(400);
  });
});
