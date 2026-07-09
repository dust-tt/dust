import config from "@marketing/lib/api/config";
import logger from "@marketing/logger/logger";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://eu.i.posthog.com";

let posthogClient: PostHog | null = null;

// Lazily-constructed, process-wide PostHog server client. Shared by every
// server-side PostHog use (pageview capture, feature-flag evaluation) so we
// keep a single client + flush loop per process.
export function getPosthogServerClient(): PostHog | null {
  if (posthogClient) {
    return posthogClient;
  }

  const apiKey = config.getPostHogApiKey();
  if (!apiKey) {
    return null;
  }

  posthogClient = new PostHog(apiKey, { host: POSTHOG_HOST });
  return posthogClient;
}

// Evaluating a flag without local evaluation configured makes a remote request,
// so we bound it: the homepage must render even when PostHog is slow or down.
const FLAG_EVAL_TIMEOUT_MS = 1000;

// Resolve a feature flag / experiment variant for a given distinct id. Returns
// `undefined` when PostHog is unconfigured, times out, or errors — callers fall
// back to their control experience in that case.
export async function getServerFeatureFlagVariant(
  flagKey: string,
  distinctId: string
): Promise<string | boolean | undefined> {
  const client = getPosthogServerClient();
  if (!client) {
    return undefined;
  }

  try {
    const timeout = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), FLAG_EVAL_TIMEOUT_MS);
    });
    // The client records the exposure event when the variant actually renders,
    // so suppress the server-side `$feature_flag_called` event here.
    const evaluation = client.getFeatureFlag(flagKey, distinctId, {
      sendFeatureFlagEvents: false,
    });
    return await Promise.race([evaluation, timeout]);
  } catch (err) {
    logger.error({ err, flagKey }, "Failed to evaluate PostHog feature flag");
    return undefined;
  }
}
