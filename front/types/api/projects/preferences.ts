import {
  NOTIFICATION_CONDITION_OPTIONS,
  type UserPodNotificationPreference,
} from "@app/types/notification_preferences";
import { z } from "zod";

export type PostUserPodStarResponseBody = {
  sId: string;
  spaceId: string;
  userId: string;
  isStarred: boolean;
};

export const PostUserPodStarBodySchema = z.object({
  starred: z.boolean(),
});

export type GetUserPodNotificationPreferenceResponseBody = {
  userProjectNotificationPreference: UserPodNotificationPreference | null;
};

export type PatchUserPodNotificationPreferenceResponseBody = {
  userProjectNotificationPreference: UserPodNotificationPreference | null;
};

export const PatchUserPodNotificationPreferenceBodySchema = z.object({
  preference: z.enum(NOTIFICATION_CONDITION_OPTIONS),
});
