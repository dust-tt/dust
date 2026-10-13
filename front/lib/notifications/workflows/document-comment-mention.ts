import config from "@app/lib/api/config";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import {
  ensureSlackNotificationsReady,
  getActiveSubscriberAuth,
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { shouldSkipConversationExternalNotification } from "@app/lib/notifications/triggers/conversation-unread";
import type { DocumentCommentMentionPayloadType } from "@app/lib/notifications/triggers/document-comment-mention";
import {
  DocumentCommentMentionPayloadSchema,
  getReadableDocument,
} from "@app/lib/notifications/triggers/document-comment-mention";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  CONVERSATION_UNREAD_TRIGGER_ID,
  DOCUMENT_COMMENT_MENTION_TRIGGER_ID,
  NOTIFICATION_DELAY_OPTIONS,
  NOTIFICATION_PREFERENCES_DELAYS,
} from "@app/types/notification_preferences";
import { removeNulls } from "@app/types/shared/utils/general";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";
import z from "zod";

const MentionDetailsSchema = z.object({
  authorName: z.string(),
  fileName: z.string(),
  locationName: z.string(),
  workspaceName: z.string(),
  route: z.string(),
  channels: z.object({
    inApp: z.boolean(),
    chat: z.boolean(),
    email: z.boolean(),
  }),
});

type MentionDetailsType = z.infer<typeof MentionDetailsSchema>;

const MentionDetailsResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: MentionDetailsSchema }),
  z.object({ success: z.literal(false) }),
]);

const UserNotificationDelaySchema = z.object({
  delay: z.enum(NOTIFICATION_DELAY_OPTIONS),
});

/**
 * @cc [owner:adrien,label:product] document-comment-mention-channels
 * A document comment mention MUST be sent on the channels the subscriber enabled for
 * conversation notifications, so it follows the settings users already manage.
 */
async function getConversationChannels(
  subscriberId: string
): Promise<MentionDetailsType["channels"]> {
  const novu = await getNovuClient();
  const { result } = await novu.subscribers.preferences.list({ subscriberId });
  const preference = result.workflows.find(
    ({ workflow }) => workflow.identifier === CONVERSATION_UNREAD_TRIGGER_ID
  );
  return {
    inApp: !!preference?.enabled && !!preference.channels.inApp,
    chat: !!preference?.enabled && !!preference.channels.chat,
    email: !!preference?.enabled && !!preference.channels.email,
  };
}

async function getMentionDetails(
  subscriberId: string,
  payload: DocumentCommentMentionPayloadType
): Promise<MentionDetailsType | null> {
  const auth = await getActiveSubscriberAuth(subscriberId, payload.workspaceId);
  if (!auth) {
    return null;
  }
  const document = await getReadableDocument(auth, payload.documentPath);
  if (!document) {
    return null;
  }
  const author = await UserResource.fetchById(payload.authorId);

  return {
    authorName: author?.fullName() ?? "",
    fileName: getFileNameFromScopedPath(payload.documentPath),
    locationName: document.locationName,
    workspaceName: auth.getNonNullableWorkspace().name,
    route: document.route,
    channels: await getConversationChannels(subscriberId),
  };
}

export function buildDocumentCommentMentionCopy(
  i18n: I18n,
  { authorName, fileName }: Pick<MentionDetailsType, "authorName" | "fileName">
): {
  subject: string;
  content: string;
  actionLabel: string;
} {
  const author = authorName || i18n._(msg`Someone`);
  return {
    subject: i18n._(msg`${author} mentioned you in "${fileName}"`),
    content: i18n._(
      msg`${author} mentioned you in a comment on "${fileName}".`
    ),
    actionLabel: i18n._(msg`View document`),
  };
}

export const documentCommentMentionWorkflow = workflow(
  DOCUMENT_COMMENT_MENTION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const detailsResult = await step.custom(
      "get-mention-details",
      async () => {
        const details = subscriber.subscriberId
          ? await getMentionDetails(subscriber.subscriberId, payload)
          : null;
        return details
          ? { success: true as const, data: details }
          : { success: false as const };
      },
      { outputSchema: MentionDetailsResultSchema }
    );
    const details = detailsResult.success ? detailsResult.data : null;

    const getI18n = async () =>
      getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );

    await step.inApp(
      "send-in-app",
      async () => {
        const d = details!;
        const { subject, content, actionLabel } =
          buildDocumentCommentMentionCopy(await getI18n(), d);
        return {
          subject,
          body: content,
          primaryAction: {
            label: actionLabel,
            redirect: { url: d.route },
          },
          data: { autoDelete: true },
        };
      },
      { skip: async () => !details?.channels.inApp }
    );

    await step.chat(
      "slack-notification",
      async () => {
        const d = details!;
        const { content, actionLabel } = buildDocumentCommentMentionCopy(
          await getI18n(),
          d
        );
        const preview = payload.messagePreview
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return {
          body: `${content}\n${preview}\n<${config.getAppUrl()}${d.route}|${actionLabel}>`,
        };
      },
      {
        skip: async () => {
          if (
            !details?.channels.chat ||
            (await shouldSkipConversationExternalNotification(
              payload.workspaceId
            ))
          ) {
            return true;
          }
          const { isReady } = await ensureSlackNotificationsReady(
            subscriber.subscriberId,
            payload.workspaceId
          );
          return !isReady;
        },
      }
    );

    const skipEmail = async () =>
      !details?.channels.email ||
      shouldSkipConversationExternalNotification(payload.workspaceId);

    const userNotificationDelayStep = await step.custom(
      "get-user-notification-delay",
      async () => ({
        delay: await getUserNotificationDelay({
          subscriberId: subscriber.subscriberId,
          workspaceId: payload.workspaceId,
          channel: "email",
        }),
      }),
      { outputSchema: UserNotificationDelaySchema, skip: skipEmail }
    );

    const { events } = await step.digest(
      "digest",
      async () => ({
        ...NOTIFICATION_PREFERENCES_DELAYS[userNotificationDelayStep.delay],
        digestKey: `workspace-${payload.workspaceId}-document-comment-mentions`,
      }),
      { skip: skipEmail }
    );

    await step.email(
      "send-email",
      async () => {
        const i18n = await getI18n();
        const readableMentions = removeNulls(
          await concurrentExecutor(
            events,
            async (event) => {
              const eventPayload = DocumentCommentMentionPayloadSchema.parse(
                event.payload
              );
              const eventDetails = subscriber.subscriberId
                ? await getMentionDetails(subscriber.subscriberId, eventPayload)
                : null;
              return eventDetails
                ? { details: eventDetails, payload: eventPayload }
                : null;
            },
            { concurrency: 8 }
          )
        );
        const mentions =
          readableMentions.length > 0
            ? readableMentions
            : [{ details: details!, payload }];
        const [first] = mentions;
        const content = mentions
          .map(
            ({ details, payload }) =>
              `${buildDocumentCommentMentionCopy(i18n, details).content}\n${payload.messagePreview}`
          )
          .join("\n\n");
        const { subject, actionLabel } = buildDocumentCommentMentionCopy(
          i18n,
          first.details
        );
        const body = await renderEmail({
          i18n,
          name: subscriber.firstName ?? undefined,
          workspace: {
            id: payload.workspaceId,
            name: first.details.workspaceName,
          },
          content,
          action: {
            label: actionLabel,
            url: config.getAppUrl() + first.details.route,
          },
        });
        const count = mentions.length;
        return {
          subject:
            count === 1
              ? `[Dust] ${subject}`
              : i18n._(
                  msg`[Dust] You were mentioned ${plural(count, { one: "once", other: "# times" })}`
                ),
          body,
        };
      },
      { skip: skipEmail }
    );
  },
  {
    payloadSchema: DocumentCommentMentionPayloadSchema,
  }
);
