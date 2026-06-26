import type * as audit from "@app/lib/api/audit/workos_audit";
import * as spendLimit from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { setSpendLimitForUsersActivity } from "@app/temporal/bulk_spend_limit/activities";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/users/spend_limit", async (importOriginal) => {
  const actual = await importOriginal<typeof spendLimit>();
  return { ...actual, setUserSpendLimit: vi.fn() };
});

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual = await importOriginal<typeof audit>();
  return {
    ...actual,
    getAuditLogContext: vi.fn(() => ({ location: "internal" })),
  };
});

beforeEach(() => {
  vi.spyOn(Authenticator, "fromUserIdAndWorkspaceId").mockResolvedValue(
    {} as Authenticator
  );
});

describe("setSpendLimitForUsersActivity", () => {
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
      workspaceId: "w1",
      actorUserId: "admin1",
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
        workspaceId: "w1",
        actorUserId: "admin1",
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
      workspaceId: "w1",
      actorUserId: "admin1",
      userIds: ["a", "b"],
      limit: { kind: "unlimited" },
    });

    expect(result.succeeded).toBe(2);
    expect(result.failures).toEqual([]);
  });
});
