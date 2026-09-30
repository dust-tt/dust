import {
  hasExplicitAnalyticsConsent,
  hasSessionReplayConsent,
} from "@marketing/lib/cookies";
import type { PostHog } from "posthog-js";

/**
 * @cc [owner:dchristenhuis,label:product;security] replay-requires-both-consents
 * Returns true only when the visitor gave explicit analytics consent (see
 * `explicit-analytics-consent-only`) AND explicit replay consent (see `replay-consent-explicit-only`).
 * Any missing condition MUST return false. There are no other inputs: login state and geolocation
 * MUST NOT influence the result. A true result only allows recording; whether PostHog actually
 * records is decided by the PostHog project's replay settings (see `replay-apply-start-and-stop`).
 */
export function shouldRecordMarketingSessionReplay({
  analyticsCookie,
  replayCookie,
}: {
  analyticsCookie: string | boolean | undefined;
  replayCookie: string | boolean | undefined;
}): boolean {
  return (
    hasExplicitAnalyticsConsent(analyticsCookie) &&
    hasSessionReplayConsent(replayCookie)
  );
}

export type SessionReplayClient = Pick<
  PostHog,
  "startSessionRecording" | "stopSessionRecording"
>;

/**
 * @cc [owner:dchristenhuis,label:product;security] replay-apply-start-and-stop
 * When `shouldRecord` is true, recording MUST be requested with `startSessionRecording()` and no
 * override argument, so the PostHog project's replay settings (enabled flag, triggers, sampling,
 * linked flags) remain the activation control. When false, recording MUST be stopped and left
 * disabled in the client config so it cannot resume later in the page's lifetime. It MUST NOT opt
 * the visitor out of capturing: PostHog persistence is shared across dust.tt subdomains, and an
 * opt-out would leak into the app and onboarding tracking.
 */
export function applyMarketingSessionReplayDecision(
  client: SessionReplayClient,
  shouldRecord: boolean
): void {
  if (shouldRecord) {
    // No override argument: PostHog project settings (triggers, sampling) stay in control.
    client.startSessionRecording();
  } else {
    // Also sets `disable_session_recording: true`, so this is safe to call when not recording.
    client.stopSessionRecording();
  }
}
