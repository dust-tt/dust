import config from "@app/lib/api/config";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import {
  ensureSlackNotificationsReady,
  getActiveSubscriberAuth,
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/document-comment-mentions";
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

const MentionSchema = z.object({
  authorName: z.string(),
  fileName: z.string(),
  route: z.string(),
});

type MentionType = z.infer<typeof MentionSchema>;

const ReadableMentionsSchema = z.object({
  workspaceName: z.string(),
  mentions: z.array(MentionSchema),
});

type ReadableMentionsType = z.infer<typeof ReadableMentionsSchema>;

const ChannelsSchema = z.object({
  inApp: z.boolean(),
  chat: z.boolean(),
  email: z.boolean(),
});

type ChannelsType = z.infer<typeof ChannelsSchema>;

const MentionResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    mention: MentionSchema,
    channels: ChannelsSchema,
  }),
  z.object({ success: z.literal(false) }),
]);

const DigestResultSchema = z.object({
  digest: ReadableMentionsSchema.nullable(),
});

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
): Promise<ChannelsType> {
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

/**
 * @cc [owner:adrien,label:security] document-comment-mention-readable
 * MUST return only the mentions whose document the subscriber can read when called, and `null`
 * when the subscriber is no longer an active member of the workspace.
 */
export async function getReadableMentions(
  subscriberId: string,
  workspaceId: string,
  payloads: DocumentCommentMentionPayloadType[]
): Promise<ReadableMentionsType | null> {
  const auth = await getActiveSubscriberAuth(subscriberId, workspaceId);
  if (!auth) {
    return null;
  }

  const documentPaths = [...new Set(payloads.map((p) => p.documentPath))];
  const documents = new Map(
    removeNulls(
      await concurrentExecutor(
        documentPaths,
        async (documentPath) => {
          const document = await getReadableDocument(auth, documentPath);
          return document ? ([documentPath, document] as const) : null;
        },
        { concurrency: 4 }
      )
    )
  );
  const authors = new Map(
    (
      await UserResource.fetchByIds([
        ...new Set(payloads.map((p) => p.authorId)),
      ])
    ).map((author) => [author.sId, author.fullName()])
  );

  return {
    workspaceName: auth.getNonNullableWorkspace().name,
    mentions: removeNulls(
      payloads.map(({ documentPath, authorId }) => {
        const document = documents.get(documentPath);
        return document
          ? {
              authorName: authors.get(authorId) ?? "",
              fileName: getFileNameFromScopedPath(documentPath),
              route: document.route,
            }
          : null;
      })
    ),
  };
}

export function buildDocumentCommentMentionCopy(
  i18n: I18n,
  { authorName, fileName }: Pick<MentionType, "authorName" | "fileName">
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
    const mentionResult = await step.custom(
      "get-mention-details",
      async () => {
        const { subscriberId } = subscriber;
        const readable = subscriberId
          ? await getReadableMentions(subscriberId, payload.workspaceId, [
              payload,
            ])
          : null;
        const mention = readable?.mentions[0];
        return subscriberId && mention
          ? {
              success: true as const,
              mention,
              channels: await getConversationChannels(subscriberId),
            }
          : { success: false as const };
      },
      { outputSchema: MentionResultSchema }
    );
    const mention = mentionResult.success ? mentionResult.mention : null;
    const channels = mentionResult.success ? mentionResult.channels : null;

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
        const m = mention!;
        const { subject, content, actionLabel } =
          buildDocumentCommentMentionCopy(await getI18n(), m);
        return {
          subject,
          body: content,
          primaryAction: {
            label: actionLabel,
            redirect: { url: m.route },
          },
          data: { autoDelete: true },
        };
      },
      { skip: async () => !channels?.inApp }
    );

    await step.chat(
      "slack-notification",
      async () => {
        const m = mention!;
        const { content, actionLabel } = buildDocumentCommentMentionCopy(
          await getI18n(),
          m
        );
        return {
          body: `${content}\n<${config.getAppUrl()}${m.route}|${actionLabel}>`,
        };
      },
      {
        skip: async () => {
          if (
            !channels?.chat ||
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
      !channels?.email ||
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

    const digestResult = await step.custom(
      "get-readable-digest",
      async () => {
        const { subscriberId } = subscriber;
        if (!subscriberId) {
          return { digest: null };
        }
        const { email } = await getConversationChannels(subscriberId);
        const digest = email
          ? await getReadableMentions(
              subscriberId,
              payload.workspaceId,
              events.map((event) =>
                DocumentCommentMentionPayloadSchema.parse(event.payload)
              )
            )
          : null;
        return { digest: digest?.mentions.length ? digest : null };
      },
      { outputSchema: DigestResultSchema, skip: skipEmail }
    );

    await step.email(
      "send-email",
      async () => {
        const i18n = await getI18n();
        const { workspaceName, mentions } = digestResult.digest!;
        const [first] = mentions;
        const count = mentions.length;
        const body = await renderEmail({
          i18n,
          name: subscriber.firstName ?? undefined,
          workspace: { id: payload.workspaceId, name: workspaceName },
          mentions: mentions.map((m) => ({
            text: buildDocumentCommentMentionCopy(i18n, m).content,
            url: config.getAppUrl() + m.route,
          })),
        });
        return {
          subject:
            count === 1
              ? `[Dust] ${buildDocumentCommentMentionCopy(i18n, first).subject}`
              : i18n._(
                  msg`[Dust] You were mentioned ${plural(count, { one: "once", other: "# times" })}`
                ),
          body,
        };
      },
      {
        skip: async () => (await skipEmail()) || !digestResult.digest,
      }
    );
  },
  {
    payloadSchema: DocumentCommentMentionPayloadSchema,
  }
);
