import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

async function getUsage(role: "user" | "admin") {
  const { workspace, key, auth } = await createPublicApiMockRequest({ role });
  await FeatureFlagFactory.basic(auth, "usage_data_api");

  return honoApp.request(
    `/api/v1/w/${workspace.sId}/usage?start_date=2024-06-01`,
    { headers: { authorization: `Bearer ${key.secret}` } }
  );
}

describe("GET /api/v1/w/:wId/usage", () => {
  it("returns 403 for a non-admin API key", async () => {
    const response = await getUsage("user");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
      },
    });
  });

  it("returns 200 with CSV for an admin API key", async () => {
    const response = await getUsage("admin");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
  });

  it("escapes cells that spreadsheet apps would run as formulas", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "usage_data_api");

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date("2026-01-15T12:00:00Z")],
    });
    await ConversationFactory.setUserMessagesFullNameForTest(
      conversation.id,
      workspace.id,
      "=1+1"
    );

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/usage?start_date=2026-01-14&end_date=2026-01-16`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(200);
    const [headers, ...rows] = (await response.text())
      .trim()
      .split("\n")
      .map((line) => line.split(","));
    const userRow = rows.find(
      (row) => row[headers.indexOf("messageType")] === "user"
    );
    expect(userRow?.[headers.indexOf("userFullName")]).toBe("'=1+1");
  });
});
