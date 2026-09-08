import { resolveFreeSeatAllowance } from "@app/lib/api/users/spend_limit";
import { FREE_SEAT_LIFETIME_AWU_CREDITS } from "@app/lib/metronome/constants";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";
import { afterEach, describe, expect, it, vi } from "vitest";

const workspace = { sId: "ws_test" } as LightWorkspaceType;
const user = { sId: "u_test" } as UserResource;
const opts = { workspace, user, signal: "cap" as const };

describe("resolveFreeSeatAllowance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the resolved grant amount", () => {
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    expect(
      resolveFreeSeatAllowance({ kind: "resolved", allowanceAwu: 1200 }, opts)
    ).toBe(1200);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("enforces the default lifetime allowance (not fail-open) when the grant is not provisioned yet, and warns", () => {
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    expect(resolveFreeSeatAllowance({ kind: "no-grant" }, opts)).toBe(
      FREE_SEAT_LIFETIME_AWU_CREDITS
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("fails open on a transient fetch-lock skip, at debug level (off the rollout error signal)", () => {
    const debug = vi.spyOn(logger, "debug");
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    expect(resolveFreeSeatAllowance({ kind: "locked" }, opts)).toBeNull();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("fails open on a genuine read error, at error level", () => {
    const error = vi.spyOn(logger, "error");

    expect(
      resolveFreeSeatAllowance(
        { kind: "read-error", error: new Error("boom") },
        opts
      )
    ).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("fails open silently when the workspace is not Metronome-billed", () => {
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    const debug = vi.spyOn(logger, "debug");

    expect(resolveFreeSeatAllowance({ kind: "no-metronome" }, opts)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });
});
