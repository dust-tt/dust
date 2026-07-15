import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it } from "vitest";

describe("WorkspaceSeatLimitResource", () => {
  let workspace: LightWorkspaceType;
  // Captured so scheduleChange can nest under the test-isolation transaction as
  // a SAVEPOINT; without it, scheduleChange opens a second DB connection that
  // cannot see the workspace created inside the (uncommitted) test transaction.
  let outerTransaction: Transaction;

  beforeEach(async (ctx) => {
    outerTransaction = (ctx as any)["transaction"] as Transaction;
    workspace = await WorkspaceFactory.basic();
  });

  it("upserts and fetches a seat limit (minSeats only)", async () => {
    const result = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });
    expect(result.isOk()).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 5, maxSeats: null });
  });

  it("upserts and fetches a seat limit with maxSeats", async () => {
    const result = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
      maxSeats: 20,
    });
    expect(result.isOk()).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 5, maxSeats: 20 });
  });

  it("rejects upsert when maxSeats < minSeats", async () => {
    const result = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 10,
      maxSeats: 5,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/maxSeats.*minSeats/);
    }

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.has("pro")).toBe(false);
  });

  it("allows maxSeats equal to minSeats", async () => {
    const result = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
      maxSeats: 5,
    });
    expect(result.isOk()).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 5, maxSeats: 5 });
  });

  it("updates minSeats and maxSeats on a second upsert for the same seat type", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
      maxSeats: 10,
    });
    const result = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 8,
      maxSeats: 15,
    });
    expect(result.isOk()).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.size).toBe(1);
    expect(limits.get("pro")).toEqual({ minSeats: 8, maxSeats: 15 });
  });

  it("keeps limits for distinct seat types independent", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 3,
      maxSeats: 10,
    });
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "max",
      minSeats: 1,
    });

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 3, maxSeats: 10 });
    expect(limits.get("max")).toEqual({ minSeats: 1, maxSeats: null });
  });

  it("removes a configured limit", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
      maxSeats: 20,
    });

    const removed = await WorkspaceSeatLimitResource.remove({
      workspace,
      seatType: "pro",
    });
    expect(removed).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.has("pro")).toBe(false);
  });

  it("returns false when removing a non-existent limit", async () => {
    const removed = await WorkspaceSeatLimitResource.remove({
      workspace,
      seatType: "pro",
    });
    expect(removed).toBe(false);
  });

  it("deletes all limits for a workspace", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 3,
    });
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "max",
      minSeats: 1,
    });

    await WorkspaceSeatLimitResource.deleteAllForWorkspace({ workspace });

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.size).toBe(0);
  });

  it("schedules a change: current value now, new value from the start date", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
      maxSeats: 10,
    });

    const startAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 8,
      maxSeats: 20,
      startAt,
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    // Now: still the current value.
    const nowLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(nowLimits.get("pro")).toEqual({ minSeats: 5, maxSeats: 10 });

    // Just before the start date: still the current value.
    const beforeLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(startAt.getTime() - 1000),
    });
    expect(beforeLimits.get("pro")).toEqual({ minSeats: 5, maxSeats: 10 });

    // From the start date onwards: the scheduled value.
    const afterLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(startAt.getTime() + 1000),
    });
    expect(afterLimits.get("pro")).toEqual({ minSeats: 8, maxSeats: 20 });
  });

  it("schedules a first-ever change with no current configuration", async () => {
    const startAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 4,
      startAt,
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    // No floor applies before the start date.
    const nowLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(nowLimits.has("pro")).toBe(false);

    const afterLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(startAt.getTime() + 1000),
    });
    expect(afterLimits.get("pro")).toEqual({ minSeats: 4, maxSeats: null });
  });

  it("applies a bounded window: limit active only between start and end", async () => {
    const startAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 7,
      startAt,
      endAt,
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    // Before the window: no limit.
    const before = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(before.has("pro")).toBe(false);

    // Inside the window: the configured limit.
    const during = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(startAt.getTime() + 1000),
    });
    expect(during.get("pro")).toEqual({ minSeats: 7, maxSeats: null });

    // After the window: no limit again.
    const after = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(endAt.getTime() + 1000),
    });
    expect(after.has("pro")).toBe(false);
  });

  it("rejects a window whose endAt is not after startAt", async () => {
    const startAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 4,
      startAt,
      endAt: startAt,
      transaction: outerTransaction,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/endAt.*startAt/);
    }
  });

  it("rejects a scheduled limit with maxSeats < minSeats", async () => {
    const result = await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 10,
      maxSeats: 5,
      startAt: new Date(Date.now() + 1000),
      transaction: outerTransaction,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/maxSeats.*minSeats/);
    }
  });

  it("supersedes a later scheduled change when a new one is set earlier", async () => {
    const laterStart = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 8,
      startAt: laterStart,
      transaction: outerTransaction,
    });

    const earlierStart = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 6,
      startAt: earlierStart,
      transaction: outerTransaction,
    });

    // The later (superseded) schedule no longer applies; the earlier one holds
    // open-ended.
    const afterLater = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(laterStart.getTime() + 1000),
    });
    expect(afterLater.get("pro")).toEqual({ minSeats: 6, maxSeats: null });
  });

  it("upsert after a scheduled change updates the open-ended (future) row", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });
    const startAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 8,
      startAt,
      transaction: outerTransaction,
    });

    // Upsert targets the open-ended (scheduled) row, not the currently active one.
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 9,
    });

    const nowLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(nowLimits.get("pro")).toEqual({ minSeats: 5, maxSeats: null });

    const afterLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(startAt.getTime() + 1000),
    });
    expect(afterLimits.get("pro")).toEqual({ minSeats: 9, maxSeats: null });
  });

  it("replaces the full schedule for a seat type", async () => {
    // Seed a limit that the replace must wipe.
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 99,
    });

    const phase1Start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const phase2Start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Only starts are provided; the resource derives phase 1's end from phase 2.
    const result = await WorkspaceSeatLimitResource.setScheduleForSeatType({
      workspace,
      seatType: "pro",
      phases: [
        { minSeats: 3, maxSeats: 10, startAt: phase1Start },
        { minSeats: 6, maxSeats: null, startAt: phase2Start },
      ],
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    // Now falls in phase 1.
    const nowLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(nowLimits.get("pro")).toEqual({ minSeats: 3, maxSeats: 10 });

    // Just before phase 2 starts, phase 1 still applies (derived end).
    const beforeLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(phase2Start.getTime() - 1000),
    });
    expect(beforeLimits.get("pro")).toEqual({ minSeats: 3, maxSeats: 10 });

    // From phase 2 start, phase 2 applies open-ended.
    const afterLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(phase2Start.getTime() + 1000),
    });
    expect(afterLimits.get("pro")).toEqual({ minSeats: 6, maxSeats: null });
  });

  it("clears a seat type when replacing with an empty schedule", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });

    const result = await WorkspaceSeatLimitResource.setScheduleForSeatType({
      workspace,
      seatType: "pro",
      phases: [],
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.has("pro")).toBe(false);
  });

  it("derives contiguous windows and an open-ended last phase from starts", async () => {
    const start1 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const start2 = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduleForSeatType({
      workspace,
      seatType: "pro",
      // Deliberately out of order to check the resource sorts by start.
      phases: [
        { minSeats: 6, maxSeats: null, startAt: start2 },
        { minSeats: 3, maxSeats: null, startAt: start1 },
      ],
      transaction: outerTransaction,
    });
    expect(result.isOk()).toBe(true);

    const schedule = await WorkspaceSeatLimitResource.fetchScheduleByWorkspace({
      workspace,
      // Read from before the first phase so both phases are returned.
      at: new Date(Date.now() + 1000),
    });
    const proPhases = schedule.get("pro") ?? [];
    expect(proPhases).toHaveLength(2);
    // Phase 1 ends exactly when phase 2 starts (derived); phase 2 is open-ended.
    expect(proPhases[0].minSeats).toBe(3);
    expect(proPhases[0].endAt?.getTime()).toBe(start2.getTime());
    expect(proPhases[1].minSeats).toBe(6);
    expect(proPhases[1].endAt).toBeNull();
  });

  it("rejects a schedule with two phases sharing a start", async () => {
    const start = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const result = await WorkspaceSeatLimitResource.setScheduleForSeatType({
      workspace,
      seatType: "pro",
      phases: [
        { minSeats: 3, maxSeats: null, startAt: start },
        { minSeats: 6, maxSeats: null, startAt: new Date(start.getTime()) },
      ],
      transaction: outerTransaction,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/distinct start/);
    }
  });

  it("removes all rows (current and scheduled) for a seat type", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });
    await WorkspaceSeatLimitResource.setScheduledLimit({
      workspace,
      seatType: "pro",
      minSeats: 8,
      startAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      transaction: outerTransaction,
    });

    const removed = await WorkspaceSeatLimitResource.remove({
      workspace,
      seatType: "pro",
    });
    expect(removed).toBe(true);

    const futureLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
      at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
    expect(futureLimits.has("pro")).toBe(false);
  });
});
