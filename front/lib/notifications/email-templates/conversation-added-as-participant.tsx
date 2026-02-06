import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";

export const ConversationAddedAsParticipantEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  userThatAddedYouFullname: z.string(),
  conversation: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
  }),
});

type ConversationAddedAsParticipantEmailTemplateProps = z.infer<
  typeof ConversationAddedAsParticipantEmailTemplatePropsSchema
>;

const ConversationAddedAsParticipantEmailTemplate = ({
  name,
  workspace,
  userThatAddedYouFullname,
  conversation,
}: ConversationAddedAsParticipantEmailTemplateProps) => {
  const url =
    process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
    getConversationRoute(workspace.id, conversation.id);

  return (
    <EmailLayout workspace={workspace}>
      <p>Hi {name},</p>
      <h3>
        {userThatAddedYouFullname} added you to the conversation "
        {conversation.title}".
      </h3>
      {conversation.summary && <div>{conversation.summary}</div>}
      <hr style={{ border: "1px solid #e0e0e0" }} />
      <a href={url} target="_blank">
        View conversation
      </a>
    </EmailLayout>
  );
};

export function renderEmail(
  args: ConversationAddedAsParticipantEmailTemplateProps
) {
  return render(<ConversationAddedAsParticipantEmailTemplate {...args} />);
}
