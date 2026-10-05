import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/w/:wId/members", () => {
  it("returns members with their seat type collapsed onto the base tier", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const proYearlyUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, proYearlyUser, {
      role: "user",
      seatType: "pro_yearly",
    });
    const freeUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, freeUser, {
      role: "user",
      seatType: "free",
    });

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/members`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    const { users } = await response.json();
    expect(users).toHaveLength(2);
    expect(users).toEqual(
      expect.arrayContaining([
        {
          sId: proYearlyUser.sId,
          id: proYearlyUser.id,
          email: proYearlyUser.email,
          seatType: "pro",
        },
        {
          sId: freeUser.sId,
          id: freeUser.id,
          email: freeUser.email,
          seatType: "free",
        },
      ])
    );
  });

  it("returns 403 for a non-admin key", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/members`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(403);
  });
});
