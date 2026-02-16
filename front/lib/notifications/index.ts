import type {
  NotificationPreferencesDelay,
  WorkflowTriggerId,
} from "@app/types/notification_preferences";
import {
  DEFAULT_NOTIFICATION_DELAY,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
} from "@app/types/notification_preferences";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { Novu } from "@novu/api";
import type { ChannelPreference } from "@novu/react";
import { createHmac } from "crypto";
import { Op } from "sequelize";

import { Authenticator } from "../auth";
import { UserMetadataModel } from "../resources/storage/models/user";

export type NotificationAllowedTags = Array<"conversations" | "admin">;

export const getNovuClient = async (): Promise<Novu> => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
  }

  const config = {
    secretKey: process.env.NOVU_SECRET_KEY,
    serverURL: process.env.NEXT_PUBLIC_NOVU_API_URL,
  };

  return new Novu(config);
};

export const getSubscriberHash = async (
  user: UserTypeWithWorkspaces
): Promise<string | null> => {
  return computeSubscriberHash(user.sId);
};

export const computeSubscriberHash = (subscriberId: string): string => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  const novuSecretKey = process.env.NOVU_SECRET_KEY;

  const hmacHash = createHmac("sha256", novuSecretKey)
    .update(subscriberId)
    .digest("hex");

  return hmacHash;
};

export const getUserNotificationDelay = async ({
  subscriberId,
  workspaceId,
  channel,
  workflowTriggerId,
}: {
  subscriberId?: string;
  workspaceId: string;
  channel: keyof ChannelPreference;
  workflowTriggerId?: WorkflowTriggerId;
}): Promise<NotificationPreferencesDelay> => {
  if (!subscriberId) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const user = auth.user();
  if (!user) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key: {
        [Op.eq]: makeNotificationPreferencesUserMetadata(
          channel,
          workflowTriggerId
        ),
      },
    },
  });
  const metadataValue = metadata?.value;
  return isNotificationPreferencesDelay(metadataValue)
    ? metadataValue
    : DEFAULT_NOTIFICATION_DELAY;
};

export const getSlackConnectionIdentifier = (userSId: string): string => {
  return `slack_connection_${userSId}`;
};
