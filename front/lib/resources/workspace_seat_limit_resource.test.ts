import { Authenticator } from "@app/lib/auth";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("WorkspaceSeatLimitResource", () => {
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
  });

  it("upserts and fetches a seat limit", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 5 });
  });

  it("updates minSeats on a second upsert for the same seat type", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
    });
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 8,
    });

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.size).toBe(1);
    expect(limits.get("pro")).toEqual({ minSeats: 8 });
  });

  it("keeps limits for distinct seat types independent", async () => {
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

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.get("pro")).toEqual({ minSeats: 3 });
    expect(limits.get("max")).toEqual({ minSeats: 1 });
  });

  it("removes a configured limit", async () => {
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 5,
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

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await WorkspaceSeatLimitResource.deleteAllForWorkspace(auth);

    const limits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    expect(limits.size).toBe(0);
  });
});
