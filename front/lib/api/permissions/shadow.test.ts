import { shadowCompare } from "@app/lib/api/permissions/shadow";

import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shadowCompare", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("does not evaluate the candidate when the flag is off", async () => {
    const candidate = vi.fn(async () => "candidate");

    const result = await shadowCompare({
      auth,
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
      legacy: "same",
      candidate,
      context: { check: "test" },
    });

    expect(result).toBe("same");
    expect(candidate).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs one stable line on mismatch and still serves the legacy result", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const warn = vi.spyOn(logger, "warn");

    const result = await shadowCompare({
      auth,
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
        legacyResult: true,
        candidateResult: false,
      }),
      "group_permissions_shadow_mismatch"
    );
  });

  it("serves the legacy result when the candidate throws", async () => {
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    const error = vi.spyOn(logger, "error");

    const result = await shadowCompare({
      auth,
      legacy: "legacy",
      candidate: async () => {
        throw new Error("candidate boom");
      },
      context: { check: "test" },
    });

    expect(result).toBe("legacy");
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ check: "test" }),
      "group_permissions_shadow_candidate_error"
    );
  });
});
