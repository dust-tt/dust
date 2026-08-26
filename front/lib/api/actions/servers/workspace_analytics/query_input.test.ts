import {
  MAX_QUERY_WINDOW_DAYS,
  resolveTimeWindow,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("resolveTimeWindow", () => {
  let auth: Authenticator;

  beforeAll(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  describe("explicit range", () => {
    it("resolves a valid range to inclusive day bounds", async () => {
      const r = await resolveTimeWindow(
        {
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
        auth
      );
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-01-01T00:00:00.000Z");
        expect(r.value.endDate).toBe("2026-01-31T23:59:59.999Z");
        expect(r.value.label).toBe("2026-01-01 to 2026-01-31");
        expect(r.value.timezone).toBe("UTC");
      }
    });

    it("errors when only one bound is provided", async () => {
      expect(
        (await resolveTimeWindow({ startDate: "2026-01-01" }, auth)).isErr()
      ).toBe(true);
      expect(
        (await resolveTimeWindow({ endDate: "2026-01-01" }, auth)).isErr()
      ).toBe(true);
    });

    it("errors when endDate is before startDate", async () => {
      expect(
        (
          await resolveTimeWindow(
            {
              startDate: "2026-02-01",
              endDate: "2026-01-01",
            },
            auth
          )
        ).isErr()
      ).toBe(true);
    });

    it(`accepts an inclusive span of exactly ${MAX_QUERY_WINDOW_DAYS} days`, async () => {
      // 2026-01-01 .. 2026-04-10 inclusive = 100 days.
      expect(
        (
          await resolveTimeWindow(
            {
              startDate: "2026-01-01",
              endDate: "2026-04-10",
            },
            auth
          )
        ).isOk()
      ).toBe(true);
    });

    it(`errors when the inclusive span exceeds ${MAX_QUERY_WINDOW_DAYS} days`, async () => {
      // 2026-01-01 .. 2026-04-11 inclusive = 101 days.
      expect(
        (
          await resolveTimeWindow(
            {
              startDate: "2026-01-01",
              endDate: "2026-04-11",
            },
            auth
          )
        ).isErr()
      ).toBe(true);
    });

    it("errors on an invalid calendar date", async () => {
      expect(
        (
          await resolveTimeWindow(
            {
              startDate: "2026-13-40",
              endDate: "2026-13-41",
            },
            auth
          )
        ).isErr()
      ).toBe(true);
    });
  });

  it("errors on an invalid timezone", async () => {
    expect(
      (
        await resolveTimeWindow(
          { period: "last_7_days", timezone: "Not/AZone" },
          auth
        )
      ).isErr()
    ).toBe(true);
  });

  describe("relative periods (fixed clock at 2026-06-15T12:00:00Z)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves last_7_days to a 7-day window ending now", async () => {
      const r = await resolveTimeWindow({ period: "last_7_days" }, auth);
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-06-09T00:00:00.000Z");
      }
    });

    it("falls back to the provided default period when none is given", async () => {
      const r = await resolveTimeWindow({}, auth, "last_30_days");
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-05-17T00:00:00.000Z");
        expect(r.value.label).toBe("the last 30 days");
      }
    });

    it("resolves this_cycle to the calendar month for a workspace with no billing cycle", async () => {
      const r = await resolveTimeWindow({ period: "this_cycle" }, auth);
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-06-01T00:00:00.000Z");
        expect(r.value.endDate).toBe("2026-07-01T00:00:00.000Z");
        expect(r.value.label).toBe("the current billing cycle");
      }
    });

    it("defaults to this_cycle when no period is given", async () => {
      const r = await resolveTimeWindow({}, auth);
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-06-01T00:00:00.000Z");
        expect(r.value.endDate).toBe("2026-07-01T00:00:00.000Z");
      }
    });
  });
});
