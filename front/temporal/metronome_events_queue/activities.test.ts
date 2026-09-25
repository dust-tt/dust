import * as spendLimit from "@app/lib/api/users/spend_limit";
import { setSpendLimitForUsersActivity } from "@app/temporal/metronome_events_queue/activities";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/users/spend_limit", async (importOriginal) => {
  const actual = await importOriginal<typeof spendLimit>();
  return { ...actual, setUserSpendLimit: vi.fn() };
});

// Real workspace + actor so the activity builds a genuine Authenticator
// (only setUserSpendLimit, the dependency under test, is mocked).
let workspaceId: string;
let actorUserId: string;

beforeEach(async () => {
  const workspace = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "manager" });
  workspaceId = workspace.sId;
  actorUserId = user.sId;
});

describe("setSpendLimitForUsersActivity", () => {
  it("rejects an actor who is no longer a workspace manager", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    await expect(
      setSpendLimitForUsersActivity({
        workspaceId: workspace.sId,
        actorUserId: user.sId,
        userIds: ["member"],
        limit: { kind: "unlimited" },
      })
    ).rejects.toThrow("Only workspace managers");
    expect(spendLimit.setUserSpendLimit).not.toHaveBeenCalled();
  });

  it("records permanent (non-retriable) failures without throwing", async () => {
    vi.mocked(spendLimit.setUserSpendLimit).mockImplementation(
      async (_auth, { userId }) =>
        userId === "bad"
          ? new Err(
              new spendLimit.UserSpendLimitError("user_not_found", "gone")
            )
          : new Ok({} as never)
    );

    const result = await setSpendLimitForUsersActivity({
      workspaceId,
      actorUserId,
      userIds: ["ok1", "bad", "ok2"],
      limit: { kind: "limited", awuCredits: 1000 },
    });

    expect(result.succeeded).toBe(2);
    expect(result.failures).toEqual([{ userId: "bad", message: "gone" }]);
    expect(spendLimit.setUserSpendLimit).toHaveBeenCalledTimes(3);
  });

  it("throws on a transient metronome failure so Temporal retries the chunk", async () => {
    vi.mocked(spendLimit.setUserSpendLimit).mockImplementation(
      async (_auth, { userId }) =>
        userId === "flaky"
          ? new Err(
              new spendLimit.UserSpendLimitError("metronome_error", "503")
            )
          : new Ok({} as never)
    );

    await expect(
      setSpendLimitForUsersActivity({
        workspaceId,
        actorUserId,
        userIds: ["ok1", "flaky"],
        limit: { kind: "limited", awuCredits: 1000 },
      })
    ).rejects.toThrow(/transient/i);
  });

  it("reports zero failures when all succeed", async () => {
    vi.mocked(spendLimit.setUserSpendLimit).mockResolvedValue(
      new Ok({} as never)
    );

    const result = await setSpendLimitForUsersActivity({
      workspaceId,
      actorUserId,
      userIds: ["a", "b"],
      limit: { kind: "unlimited" },
    });

    expect(result.succeeded).toBe(2);
    expect(result.failures).toEqual([]);
  });
});
