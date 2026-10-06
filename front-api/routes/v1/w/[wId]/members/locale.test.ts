import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function postMemberLocale(
  workspace: { sId: string },
  key: { secret: string },
  body: unknown
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/members/locale`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/w/:wId/members/locale", () => {
  it("returns the locale stored by an active member", async () => {
    const { auth, workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    await FeatureFlagFactory.basic(auth, "localisation");
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    const response = await postMemberLocale(workspace, key, {
      email: user.email,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      localisationEnabled: true,
      userLocale: "fr-FR",
      workspaceLocale: workspace.locale,
    });
  });

  it("returns a null user locale for a member without a stored locale", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await postMemberLocale(workspace, key, {
      email: user.email,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      localisationEnabled: false,
      userLocale: null,
      workspaceLocale: workspace.locale,
    });
  });

  it("returns a null user locale for an email that is not a member", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const outsider = await UserFactory.basic();
    await outsider.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    const response = await postMemberLocale(workspace, key, {
      email: outsider.email,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).userLocale).toBeNull();
  });

  it("returns only the workspace locale without email", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await postMemberLocale(workspace, key, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      localisationEnabled: false,
      userLocale: null,
      workspaceLocale: workspace.locale,
    });
  });

  it("rejects keys that are not system keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await postMemberLocale(workspace, key, {
      email: "someone@example.com",
    });

    expect(response.status).toBe(403);
  });
});
