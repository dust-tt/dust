import { shadowCompare } from "@app/lib/api/permissions/shadow";

import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe.each([false, true])("shadowCompare (reverse: %s)", (reverse) => {
  let auth: Authenticator;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("does not evaluate the candidate when the flag is off", async () => {
    const candidate = vi.fn(async () => "candidate");

    const result = await shadowCompare({
      auth,
      reverse,
      legacy: "legacy",
      candidate,
      context: { check: "test" },
    });

    expect(result).toBe("legacy");
    expect(candidate).not.toHaveBeenCalled();
  });

  it("evaluates the candidate but does not log when results match", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const warn = vi.spyOn(logger, "warn");
    const candidate = vi.fn(async () => "same");

    const result = await shadowCompare({
      auth,
      reverse,
      legacy: "same",
      candidate,
      context: { check: "test" },
    });

    expect(result).toBe("same");
    expect(candidate).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs one stable line on mismatch and still serves the selected result", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const warn = vi.spyOn(logger, "warn");

    const result = await shadowCompare({
      auth,
      reverse,
      legacy: true,
      candidate: async () => false,
      context: { check: "can_create_agent", workspaceId: 42 },
    });

    expect(result).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        check: "can_create_agent",
        workspaceId: 42,
        legacyResult: !reverse,
        candidateResult: reverse,
        servedSource: reverse ? "grants" : "legacy",
      }),
      "group_permissions_shadow_mismatch"
    );
  });

  it("serves the selected result when the other source throws", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const error = vi.spyOn(logger, "error");

    const result = await shadowCompare({
      auth,
      reverse,
      legacy: "legacy",
      candidate: async () => {
        throw new Error("candidate boom");
      },
      context: { check: "test" },
    });

    expect(result).toBe("legacy");
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        check: "test",
        servedSource: reverse ? "grants" : "legacy",
      }),
      "group_permissions_shadow_candidate_error"
    );
  });

  it("keeps async comparison arguments in legacy/grant order", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const equals = vi.fn(async () => true);
    const result = await shadowCompare({
      auth,
      reverse,
      legacy: reverse ? "grants" : "legacy",
      candidate: async () => (reverse ? "legacy" : "grants"),
      context: { check: "test" },
      equals,
    });
    expect(result).toBe(reverse ? "grants" : "legacy");
    expect(equals).toHaveBeenCalledWith("legacy", "grants");
  });
});
