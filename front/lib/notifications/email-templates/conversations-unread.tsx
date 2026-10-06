import config from "@app/lib/api/config";
import {
  EmailGreeting,
  EmailLayout,
  renderEmailWithI18n,
} from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import type { I18n } from "@lingui/core";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as React from "react";
import { z } from "zod";

export const ConversationsUnreadEmailTemplatePropsSchema = z.object({
  name: z.string().optional(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      hasUnreadMentions: z.boolean(),
      summary: z.string().nullable(),
      // Fields for new project conversation notifications.
      isNewProjectConversation: z.boolean().optional(),
      projectName: z.string().optional(),
      createdByFullName: z.string().optional(),
      messagePreview: z.string().optional(),
    })
  ),
});

type ConversationsUnreadEmailTemplateProps = z.infer<
  typeof ConversationsUnreadEmailTemplatePropsSchema
>;

const ConversationsUnreadEmailTemplate = ({
  name,
  workspace,
  conversations,
}: ConversationsUnreadEmailTemplateProps) => {
  const { t } = useLingui();
  const conversationsWithMention = conversations.filter(
    (c) => c.hasUnreadMentions && !c.isNewProjectConversation
  );
  const unreadConversationsWithoutMention = conversations.filter(
    (c) => !c.hasUnreadMentions && !c.isNewProjectConversation
  );
  const newProjectConversations = conversations.filter(
    (c) => c.isNewProjectConversation
  );
  const uniqueProjectNames = [
    ...new Set(
      newProjectConversations.map((c) => c.projectName).filter(Boolean)
    ),
  ];
  const isSingleProject = uniqueProjectNames.length === 1;
  const mentionCount = conversationsWithMention.length;
  const unreadCount = unreadConversationsWithoutMention.length;
  const newProjectConversationCount = newProjectConversations.length;
  const singleProjectName = uniqueProjectNames[0];

  const hasPreviousSection = (sectionIndex: number) => {
    const sections = [
      conversationsWithMention,
      unreadConversationsWithoutMention,
      newProjectConversations,
    ];
    return sections.slice(0, sectionIndex).some((s) => s.length > 0);
  };

  return (
    <EmailLayout workspace={workspace}>
      <p>
        <EmailGreeting name={name} />
      </p>

      {conversationsWithMention.length > 0 && (
        <>
          <p>
            🔔{" "}
            <Plural
              value={mentionCount}
              one="You have been mentioned in the following conversation:"
              other="You have been mentioned in the following conversations:"
            />
          </p>
          <div
            style={{
              paddingBottom: "12px",
              borderBottom: "2px solid #F3F4F6",
            }}
          >
            {conversationsWithMention.map((conversation) => (
              <div key={conversation.id}>
                <h4>
                  <a
                    href={getConversationRoute(
                      workspace.id,
                      conversation.id,
                      undefined,
                      config.getAppUrl()
                    )}
                    target="_blank"
                  >
                    {conversation.title}
                  </a>
                </h4>
                {conversation.summary && <div>{conversation.summary}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {unreadConversationsWithoutMention.length > 0 && (
        <>
          <p
            style={{
              marginTop: hasPreviousSection(1) ? "24px" : "0",
            }}
          >
            📬{" "}
            <Plural
              value={unreadCount}
              one="You have unread message(s) in the following conversation:"
              other="You have unread message(s) in the following conversations:"
            />
          </p>
          <div
            style={{
              paddingBottom: "12px",
              borderBottom: "2px solid #F3F4F6",
            }}
          >
            {unreadConversationsWithoutMention.map((conversation) => (
              <div key={conversation.id}>
                <h4>
                  <a
                    href={getConversationRoute(
                      workspace.id,
                      conversation.id,
                      undefined,
                      config.getAppUrl()
                    )}
                    target="_blank"
                  >
                    {conversation.title}
                  </a>
                </h4>
                {conversation.summary && <div>{conversation.summary}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {newProjectConversations.length > 0 && (
        <>
          <p
            style={{
              marginTop: hasPreviousSection(2) ? "24px" : "0",
            }}
          >
            📁{" "}
            {isSingleProject
              ? t`${plural(newProjectConversationCount, {
                  one: `There's a new conversation in ${singleProjectName}:`,
                  other: `There are # new conversations in ${singleProjectName}:`,
                })}`
              : t`${plural(newProjectConversationCount, {
                  one: "There is # new conversation in your Pods:",
                  other: "There are # new conversations in your Pods:",
                })}`}
          </p>
          <div>
            {newProjectConversations.map((conversation) => {
              const createdBy = conversation.createdByFullName ?? t`Someone`;
              const conversationTitle = conversation.title;
              const projectName = conversation.projectName;
              return (
                <div key={conversation.id}>
                  <h4>
                    <a
                      href={getConversationRoute(
                        workspace.id,
                        conversation.id,
                        undefined,
                        config.getAppUrl()
                      )}
                      target="_blank"
                    >
                      {isSingleProject ? (
                        <Trans>
                          {createdBy} started "{conversationTitle}"
                        </Trans>
                      ) : (
                        <Trans>
                          {createdBy} started "{conversationTitle}" in{" "}
                          {projectName}
                        </Trans>
                      )}
                    </a>
                  </h4>
                  {conversation.messagePreview && (
                    <blockquote
                      style={{
                        borderLeft: "3px solid #969CA5",
                        paddingLeft: "12px",
                        margin: "4px 0 0 0",
                      }}
                    >
                      {conversation.messagePreview
                        .split("\n")
                        .map((line, i) => (
                          <React.Fragment key={i}>
                            {line}
                            <br />
                          </React.Fragment>
                        ))}
                    </blockquote>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </EmailLayout>
  );
};

export function renderEmail({
  i18n,
  ...args
}: ConversationsUnreadEmailTemplateProps & { i18n: I18n }) {
  return renderEmailWithI18n(
    i18n,
    <ConversationsUnreadEmailTemplate {...args} />
  );
}
