import config from "@app/lib/api/config";
import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

export const ConversationsUnreadEmailTemplatePropsSchema = z.object({
  name: z.string(),
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
      <p>Hi {name},</p>

      {conversationsWithMention.length > 0 && (
        <>
          <p>
            🔔 You have been mentioned in the following conversation
            {pluralize(conversationsWithMention.length)}:
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
            📬 You have unread message(s) in the following conversation
            {pluralize(unreadConversationsWithoutMention.length)}:
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
              ? newProjectConversations.length === 1
                ? `There's a new conversation in ${uniqueProjectNames[0]}:`
                : `There are ${newProjectConversations.length} new conversations in ${uniqueProjectNames[0]}:`
              : `There are ${newProjectConversations.length} new conversations in your projects:`}
          </p>
          <div>
            {newProjectConversations.map((conversation) => (
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
                    {conversation.createdByFullName ?? "Someone"} started "
                    {conversation.title}"
                    {!isSingleProject && ` in ${conversation.projectName}`}
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
                    {conversation.messagePreview.split("\n").map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))}
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </EmailLayout>
  );
};

export function renderEmail(args: ConversationsUnreadEmailTemplateProps) {
  return render(<ConversationsUnreadEmailTemplate {...args} />);
}
