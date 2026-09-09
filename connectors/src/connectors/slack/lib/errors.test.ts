import { ErrorCode } from "@slack/web-api";
import { describe, expect, it } from "vitest";

import { isSlackPostingPermissionError, isWebAPIPlatformError } from "./errors";

function makePlatformError(error: string) {
  return {
    code: ErrorCode.PlatformError,
    data: { ok: false, error },
  };
}

describe("isWebAPIPlatformError", () => {
  it("recognizes the platform errors handled by sync and permission retrieval", () => {
    for (const error of [
      "account_inactive",
      "not_in_channel",
      "thread_not_found",
    ]) {
      expect(isWebAPIPlatformError(makePlatformError(error))).toBe(true);
    }
  });

  it("rejects non-platform and malformed errors without throwing", () => {
    for (const error of [
      null,
      undefined,
      "not_in_channel",
      new Error("not_in_channel"),
      {},
      { code: ErrorCode.PlatformError },
      { code: ErrorCode.PlatformError, data: null },
      { code: ErrorCode.PlatformError, data: {} },
      { code: ErrorCode.PlatformError, data: { error: 123 } },
      { code: ErrorCode.HTTPError, data: { error: "not_in_channel" } },
    ]) {
      expect(isWebAPIPlatformError(error)).toBe(false);
    }
  });
});

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
