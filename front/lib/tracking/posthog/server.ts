import config from "@app/lib/api/config";
import type { UTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, UserType } from "@app/types/user";
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
  static trackSignup({
    user,
    utmParams,
    userCreated,
  }: {
    user: UserType;
    utmParams?: UTMParams;
    userCreated?: boolean;
  }): void {
    const client = getClient();
    if (!client) {
      return;
    }

    try {
      const utmProperties: Record<string, string> = {};
      if (utmParams) {
        for (const [key, value] of Object.entries(utmParams)) {
          if (value) {
            utmProperties[key] = value;
          }
        }
      }

      client.identify({
        distinctId: user.sId,
        properties: {
          first_name: user.firstName,
          last_name: user.lastName,
          name: user.fullName,
          provider: user.provider,
          ...utmProperties,
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

  static trackWorkspaceCreated({
    user,
    workspace,
    utmParams,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
    utmParams?: UTMParams;
  }): void {
    const client = getClient();
    if (!client) {
      return;
    }

    try {
      const utmProperties: Record<string, string> = {};
      if (utmParams) {
        for (const [key, value] of Object.entries(utmParams)) {
          if (value) {
            utmProperties[key] = value;
          }
        }
      }

      client.capture({
        distinctId: user.sId,
        event: "workspace_created",
        properties: {
          workspace_sId: workspace.sId,
          workspace_name: workspace.name,
          ...utmProperties,
        },
        groups: { workspace: workspace.sId },
      });
    } catch (err) {
      logger.error(
        { userId: user.sId, workspaceId: workspace.sId, err },
        "Failed to track workspace_created on PostHog"
      );
    }
  }
}
