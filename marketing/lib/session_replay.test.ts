import {
  hasExplicitAnalyticsConsent,
  hasSessionReplayConsent,
} from "@marketing/lib/cookies";
import type { SessionReplayClient } from "@marketing/lib/session_replay";
import {
  applyMarketingSessionReplayDecision,
  shouldRecordMarketingSessionReplay,
} from "@marketing/lib/session_replay";
import { describe, expect, it, vi } from "vitest";

function makeClient() {
  const client = {
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
    opt_out_capturing: vi.fn(),
  };
  // The opt-out spy is only there to prove it is never called.
  const typed: SessionReplayClient = client;
  return { client, typed };
}

describe("consent cookie helpers", () => {
  it("treats only an explicit accept as analytics consent", () => {
    expect(hasExplicitAnalyticsConsent("true")).toBe(true);
    expect(hasExplicitAnalyticsConsent("auto")).toBe(false);
    expect(hasExplicitAnalyticsConsent("false")).toBe(false);
    expect(hasExplicitAnalyticsConsent(undefined)).toBe(false);
  });

  it("treats only 'granted' as replay consent", () => {
    expect(hasSessionReplayConsent("granted")).toBe(true);
    expect(hasSessionReplayConsent("denied")).toBe(false);
    expect(hasSessionReplayConsent(undefined)).toBe(false);
    expect(hasSessionReplayConsent("true")).toBe(false);
    expect(hasSessionReplayConsent(true)).toBe(false);
  });
});

describe("shouldRecordMarketingSessionReplay", () => {
  it("records only with explicit analytics and explicit replay consent", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "true",
        replayCookie: "granted",
      })
    ).toBe(true);
  });

  it("does not infer replay consent from accepting analytics cookies", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "true",
        replayCookie: undefined,
      })
    ).toBe(false);
  });

  it("does not infer consent from geolocation-based auto consent", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "auto",
        replayCookie: "granted",
      })
    ).toBe(false);
  });

  it("requires analytics consent before allowing replay", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "false",
        replayCookie: "granted",
      })
    ).toBe(false);
  });

  it("stays off after rejecting both", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "false",
        replayCookie: "denied",
      })
    ).toBe(false);
  });

  it("stays off before any choice is made", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: undefined,
        replayCookie: undefined,
      })
    ).toBe(false);
  });

  it("stays off after replay consent is withdrawn", () => {
    expect(
      shouldRecordMarketingSessionReplay({
        analyticsCookie: "true",
        replayCookie: "denied",
      })
    ).toBe(false);
  });
});

describe("applyMarketingSessionReplayDecision", () => {
  it("starts recording on consent, without overriding PostHog project settings", () => {
    const { client, typed } = makeClient();
    applyMarketingSessionReplayDecision(typed, true);
    expect(client.startSessionRecording).toHaveBeenCalledTimes(1);
    expect(client.startSessionRecording).toHaveBeenCalledWith();
    expect(client.stopSessionRecording).not.toHaveBeenCalled();
  });

  it("stops recording on withdrawal without opting out of all capturing", () => {
    const { client, typed } = makeClient();
    applyMarketingSessionReplayDecision(typed, true);
    applyMarketingSessionReplayDecision(typed, false);
    expect(client.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(client.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("never starts recording without consent", () => {
    const { client, typed } = makeClient();
    applyMarketingSessionReplayDecision(typed, false);
    expect(client.startSessionRecording).not.toHaveBeenCalled();
  });
});
