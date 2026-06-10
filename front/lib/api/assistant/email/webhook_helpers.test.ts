import type { EmailTriggerError } from "@app/lib/api/assistant/email/email_trigger";
import {
  EMAIL_WEBHOOK_RELAY_HEADER,
  EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
  EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER,
  resolveRelayedErrorReply,
  shouldRelayToOtherRegion,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { describe, expect, it } from "vitest";

const SENDER_EMAIL = "jdoe@example.com";

const RELAYED_HEADERS = {
  [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
};

function makeError(type: EmailTriggerError["type"]): EmailTriggerError {
  return { type, message: `${type} message` };
}

describe("shouldRelayToOtherRegion", () => {
  it.each([
    "user_not_found",
    "workspace_not_found",
    "email_agents_disabled",
  ] as const)("relays %s errors on non-relayed requests", (type) => {
    expect(
      shouldRelayToOtherRegion({ headers: {}, error: makeError(type) })
    ).toBe(true);
  });

  it.each([
    "user_not_found",
    "workspace_not_found",
    "email_agents_disabled",
  ] as const)("does not relay %s errors on already-relayed requests", (type) => {
    expect(
      shouldRelayToOtherRegion({
        headers: RELAYED_HEADERS,
        error: makeError(type),
      })
    ).toBe(false);
  });

  it.each([
    "unexpected_error",
    "invalid_email_error",
    "assistant_not_found",
  ] as const)("does not relay %s errors", (type) => {
    expect(
      shouldRelayToOtherRegion({ headers: {}, error: makeError(type) })
    ).toBe(false);
  });
});

describe("resolveRelayedErrorReply", () => {
  it("returns the local error on non-relayed requests", () => {
    const localError = makeError("user_not_found");
    expect(
      resolveRelayedErrorReply({
        headers: {
          [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
        },
        localError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(localError);
  });

  it("returns the local error when no source error header is present", () => {
    const localError = makeError("user_not_found");
    expect(
      resolveRelayedErrorReply({
        headers: RELAYED_HEADERS,
        localError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(localError);
  });

  it("returns the local error when the source error header is invalid", () => {
    const localError = makeError("user_not_found");
    expect(
      resolveRelayedErrorReply({
        headers: {
          ...RELAYED_HEADERS,
          [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "not_a_real_error_type",
        },
        localError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(localError);
  });

  it("replies with the source error when it is more informative", () => {
    const resolved = resolveRelayedErrorReply({
      headers: {
        ...RELAYED_HEADERS,
        [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
      },
      localError: makeError("user_not_found"),
      senderEmail: SENDER_EMAIL,
    });
    expect(resolved.type).toBe("email_agents_disabled");
    expect(resolved.message).toContain("Email agents are disabled");
  });

  it("keeps the local error when it is at least as informative as the source error", () => {
    const localError = makeError("email_agents_disabled");
    expect(
      resolveRelayedErrorReply({
        headers: {
          ...RELAYED_HEADERS,
          [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "user_not_found",
        },
        localError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(localError);

    const sameTypeLocalError = makeError("email_agents_disabled");
    expect(
      resolveRelayedErrorReply({
        headers: {
          ...RELAYED_HEADERS,
          [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
        },
        localError: sameTypeLocalError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(sameTypeLocalError);
  });

  it("keeps the local error when it is not relay-eligible", () => {
    const localError = makeError("unexpected_error");
    expect(
      resolveRelayedErrorReply({
        headers: {
          ...RELAYED_HEADERS,
          [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
        },
        localError,
        senderEmail: SENDER_EMAIL,
      })
    ).toBe(localError);
  });

  it("includes the sender email when resolving to workspace_not_found", () => {
    const resolved = resolveRelayedErrorReply({
      headers: {
        ...RELAYED_HEADERS,
        [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "workspace_not_found",
      },
      localError: makeError("user_not_found"),
      senderEmail: SENDER_EMAIL,
    });
    expect(resolved.type).toBe("workspace_not_found");
    expect(resolved.message).toContain(SENDER_EMAIL);
  });
});
