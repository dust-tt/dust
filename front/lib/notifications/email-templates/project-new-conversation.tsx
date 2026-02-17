import config from "@app/lib/api/config";
import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import { render } from "@react-email/render";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import * as React from "react";
import { z } from "zod";

export const ProjectNewConversationEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      projectName: z.string(),
      createdByFullName: z.string(),
    })
  ),
});

type ProjectNewConversationEmailTemplateProps = z.infer<
  typeof ProjectNewConversationEmailTemplatePropsSchema
>;

const ProjectNewConversationEmailTemplate = ({
  name,
  workspace,
  conversations,
}: ProjectNewConversationEmailTemplateProps) => {
  return (
    <EmailLayout workspace={workspace}>
      <p>Hi {name},</p>
      <p>
        {conversations.length === 1
          ? `A new conversation has been created in ${conversations[0].projectName}:`
          : `${conversations.length} new conversations have been created in your projects:`}
      </p>
      <ul>
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <a
              href={getConversationRoute(
                workspace.id,
                conversation.id,
                undefined,
                config.getAppUrl()
              )}
              target="_blank"
            >
              {conversation.createdByFullName} created "{conversation.title}"
            </a>
          </li>
        ))}
      </ul>
    </EmailLayout>
  );
};

export function renderEmail(args: ProjectNewConversationEmailTemplateProps) {
  return render(<ProjectNewConversationEmailTemplate {...args} />);
}
