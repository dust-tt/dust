import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

import config from "@app/lib/api/config";
import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import { pluralize } from "@app/types/shared/utils/string_utils";

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
    (c) => c.hasUnreadMentions
  );
  const otherConversations = conversations.filter((c) => !c.hasUnreadMentions);

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
                <h3>
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
                </h3>
                {conversation.summary && <div>{conversation.summary}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {otherConversations.length > 0 && (
        <>
          <p
            style={{
              marginTop: conversationsWithMention.length > 0 ? "24px" : "0",
            }}
          >
            📬 You have unread message(s) in the following conversation
            {pluralize(otherConversations.length)}:
          </p>
          <div>
            {otherConversations.map((conversation) => (
              <div key={conversation.id}>
                <h3>
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
                </h3>
                {conversation.summary && <div>{conversation.summary}</div>}
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
