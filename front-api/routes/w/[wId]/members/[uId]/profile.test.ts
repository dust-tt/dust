import { updateUserProfile } from "@app/lib/api/user_profile";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { GetUserProfileResponseBody } from "@app/types/api/user_profile";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getProfile(wId: string, uId: string) {
  return honoApp.request(`/api/w/${wId}/members/${uId}/profile`);
}

describe("GET /api/w/:wId/members/:uId/profile", () => {
  it("returns another member's pronouns and job title", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");
    const { agentOwner: colleague, agentOwnerAuth: colleagueAuth } =
      await setupAgentOwner(workspace, "user");
    await updateUserProfile(colleagueAuth, colleague, {
      pronouns: "he/him",
      jobTitle: "Designer",
    });

    const response = await getProfile(workspace.sId, colleague.sId);

    expect(response.status).toBe(200);
    const { profile }: GetUserProfileResponseBody = await response.json();
    expect(profile.pronouns).toBe("he/him");
    expect(profile.jobTitle).toBe("Designer");
  });

  it("shows the identity provider job title over the user-entered one", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");
    const { agentOwner: colleague, agentOwnerAuth: colleagueAuth } =
      await setupAgentOwner(workspace, "user");
    await updateUserProfile(colleagueAuth, colleague, {
      pronouns: null,
      jobTitle: "Self-declared title",
    });
    await colleague.setMetadata(
      "workos:job_title",
      "VP Sales, France & Benelux",
      auth.getNonNullableWorkspace().id
    );

    const response = await getProfile(workspace.sId, colleague.sId);

    expect(response.status).toBe(200);
    const { profile }: GetUserProfileResponseBody = await response.json();
    expect(profile.jobTitle).toBe("VP Sales, France & Benelux");
    expect(profile.isJobTitleManaged).toBe(true);
  });

  it("returns 404 for a user outside the workspace", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");
    const outsider = await UserFactory.basic();

    const response = await getProfile(workspace.sId, outsider.sId);

    expect(response.status).toBe(404);
  });
});
