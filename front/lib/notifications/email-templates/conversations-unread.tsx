import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";

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
  return (
    <EmailLayout workspace={workspace}>
      <p>Hi {name},</p>
      <p>You have unread message(s) in the following conversations:</p>
      <div>
        {conversations.map((conversation) => (
          <div key={conversation.id}>
            <h3>
              <a
                href={
                  process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
                  getConversationRoute(workspace.id, conversation.id)
                }
                target="_blank"
              >
                {conversation.title}
              </a>
            </h3>
            {conversation.summary && <div>{conversation.summary}</div>}
          </div>
        ))}
      </div>
    </EmailLayout>
  );
};

export function renderEmail(args: ConversationsUnreadEmailTemplateProps) {
  return render(<ConversationsUnreadEmailTemplate {...args} />);
}
