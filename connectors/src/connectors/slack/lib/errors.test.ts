import { ErrorCode } from "@slack/web-api";
import { describe, expect, it } from "vitest";

import { isSlackPostingPermissionError } from "./errors";

function makePlatformError(error: string) {
  return {
    code: ErrorCode.PlatformError,
    data: { ok: false, error },
  };
}

describe("isSlackPostingPermissionError", () => {
  it("returns true for channel posting restriction errors", () => {
    for (const error of [
      "restricted_action",
      "restricted_action_read_only_channel",
      "restricted_action_thread_only_channel",
      "restricted_action_non_threadable_channel",
      "not_in_channel",
    ]) {
      expect(isSlackPostingPermissionError(makePlatformError(error))).toBe(
        true
      );
    }
  });

  it("returns false for unrelated platform errors", () => {
    expect(
      isSlackPostingPermissionError(makePlatformError("message_not_found"))
    ).toBe(false);
    expect(
      isSlackPostingPermissionError(makePlatformError("rate_limited"))
    ).toBe(false);
  });

  it("returns false for non-Slack errors", () => {
    expect(isSlackPostingPermissionError(new Error("restricted_action"))).toBe(
      false
    );
    expect(isSlackPostingPermissionError(null)).toBe(false);
    expect(isSlackPostingPermissionError(undefined)).toBe(false);
  });
});
