import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import {
  FRAME_LOGIN_CODE_TRIGGER_ID,
  FRAME_SHARED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const FrameLoginCodePayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  sharedByName: z.string(),
  code: z.string(),
  expiresInMinutes: z.number(),
});

export type FrameLoginCodePayloadType = z.infer<
  typeof FrameLoginCodePayloadSchema
>;

export const FrameSharedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  sharedByName: z.string(),
  frameUrl: z.string(),
});

export type FrameSharedPayloadType = z.infer<typeof FrameSharedPayloadSchema>;

export function notifyFrameLoginCode({
  recipient,
  ...payload
}: FrameLoginCodePayloadType & {
  recipient: EmailRecipient;
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: FRAME_LOGIN_CODE_TRIGGER_ID,
    recipients: [recipient],
    payload,
  });
}

export function notifyFrameShared({
  recipient,
  ...payload
}: FrameSharedPayloadType & {
  recipient: EmailRecipient;
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: FRAME_SHARED_TRIGGER_ID,
    recipients: [recipient],
    payload,
  });
}
