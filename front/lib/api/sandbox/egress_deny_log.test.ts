import {
  partitionDenyLogEntries,
  withBlockedEgressHint,
} from "@app/lib/api/sandbox/egress_deny_log";
import { describe, expect, it } from "vitest";

const denyLine = (fields: Record<string, unknown>) =>
  JSON.stringify({
    ts: "t",
    secret_name: "unknown",
    sni: null,
    host: null,
    ...fields,
  });

describe("partitionDenyLogEntries", () => {
  it("renders allowlist denials for the agent and collects their domains once", () => {
    const summary = partitionDenyLogEntries([
      denyLine({ reason: "proxy_denied", domain: "api.stripe.com", port: 443 }),
      denyLine({ reason: "proxy_denied", domain: "api.stripe.com", port: 443 }),
      denyLine({ reason: "proxy_denied", domain: "hooks.slack.com" }),
    ]);

    expect(summary.agentFacing).toEqual([
      "denied api.stripe.com:443 (blocked by egress allowlist)",
      "denied api.stripe.com:443 (blocked by egress allowlist)",
      "denied hooks.slack.com (blocked by egress allowlist)",
    ]);
    expect(summary.blockedDomains).toEqual([
      "api.stripe.com",
      "hooks.slack.com",
    ]);
    expect(summary.harnessDenials).toEqual([]);
  });

  it("hides harness denials from the agent but keeps them for logging", () => {
    const summary = partitionDenyLogEntries([
      denyLine({
        reason: "placeholder_on_non_allowed",
        domain: "api.openai.com",
        port: 443,
      }),
    ]);

    expect(summary.agentFacing).toEqual([]);
    expect(summary.blockedDomains).toEqual([]);
    expect(summary.harnessDenials).toEqual([
      { reason: "placeholder_on_non_allowed", domain: "api.openai.com" },
    ]);
  });

  it("keeps unrecognized lines verbatim and does not treat them as blocked domains", () => {
    const summary = partitionDenyLogEntries([
      "not json at all",
      denyLine({ reason: "proxy_denied", domain: null }),
    ]);

    expect(summary.agentFacing).toEqual([
      "not json at all",
      denyLine({ reason: "proxy_denied", domain: null }),
    ]);
    expect(summary.blockedDomains).toEqual([]);
  });
});

describe("withBlockedEgressHint", () => {
  const error = { code: "threw" as const, message: "fetch failed." };

  it("points a Frame function at the manifest", () => {
    expect(
      withBlockedEgressHint(error, {
        blockedDomains: ["api.stripe.com"],
        ownerKind: "frame",
      })
    ).toEqual({
      code: "threw",
      message:
        "fetch failed. Egress blocked for: api.stripe.com. To allow them, add them to the " +
        'manifest\'s "domains" and republish, or call request_egress_domain.',
    });
  });

  it("points a Pod Function at the publish tool", () => {
    expect(
      withBlockedEgressHint(error, {
        blockedDomains: ["api.stripe.com", "hooks.slack.com"],
        ownerKind: "pod",
      }).message
    ).toContain(
      "Egress blocked for: api.stripe.com, hooks.slack.com. To allow them, declare them in the " +
        'publish tool\'s "domains", or call request_egress_domain.'
    );
  });

  it("returns the error unchanged when nothing was blocked", () => {
    expect(
      withBlockedEgressHint(error, { blockedDomains: [], ownerKind: "frame" })
    ).toBe(error);
  });
});
