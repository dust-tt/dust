import config from "@app/lib/api/config";
import type { UTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import type { UserType } from "@app/types/user";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://eu.i.posthog.com";

let posthogClient: PostHog | null = null;

function getClient(): PostHog | null {
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

export class PostHogServerSideTracking {
  /**
   * Alias an anonymous device ID to an identified user so that all pre-signup
   * events captured with `dust_anonymous_id` are merged into the user's
   * PostHog person profile.
   */
  static aliasAnonymousId({
    anonymousId,
    userId,
  }: {
    anonymousId: string;
    userId: string;
  }): void {
    const client = getClient();
    if (!client) {
      return;
    }

    try {
      client.alias({
        distinctId: userId,
        alias: anonymousId,
      });
    } catch (err) {
      logger.error(
        { userId, anonymousId, err },
        "Failed to alias anonymous ID on PostHog"
      );
    }
  }

  static trackSignup({
    user,
    utmParams,
    anonymousId,
    userCreated,
  }: {
    user: UserType;
    utmParams?: UTMParams;
    anonymousId?: string;
    userCreated?: boolean;
  }): void {
    const client = getClient();
    if (!client) {
      return;
    }

    try {
      // Stitch the anonymous device ID to the identified user.
      if (anonymousId) {
        PostHogServerSideTracking.aliasAnonymousId({
          anonymousId,
          userId: user.sId,
        });
      }

      const utmProperties: Record<string, string> = {};
      if (utmParams) {
        for (const [key, value] of Object.entries(utmParams)) {
          if (value) {
            utmProperties[key] = value;
          }
        }
      }

      /* Set person properties and first-touch attribution via $set/$set_once.
      We intentionally avoid client.identify() here because it generates a
        server-side distinct_id that would create an extra "person".
      The identify() call happens from the frontend (posthog-js)
        which naturally merges the browser's anonymous distinct_id with user.sId.
      */
      const setProps: Record<string, string> = {
        first_name: user.firstName,
        last_name: user.lastName ?? "",
        name: user.fullName,
        ...(user.provider ? { provider: user.provider } : {}),
        ...utmProperties,
      };

      const setOnceProps: Record<string, string> = {};
      for (const [key, value] of Object.entries(utmProperties)) {
        setOnceProps[`first_${key}`] = value;
      }

      client.capture({
        distinctId: user.sId,
        event: "$set",
        properties: {
          $set: setProps,
          ...(Object.keys(setOnceProps).length > 0
            ? { $set_once: setOnceProps }
            : {}),
        },
      });

      if (userCreated) {
        client.capture({
          distinctId: user.sId,
          event: "signup",
          properties: {
            provider: user.provider,
            ...utmProperties,
          },
        });
      }
    } catch (err) {
      logger.error(
        { userId: user.sId, err },
        "Failed to track signup on PostHog"
      );
    }
  }
}
