import config from "@app/lib/api/config";
import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

export const ProjectNewConversationEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  projectCount: z.number(),
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      projectName: z.string(),
      createdByFullName: z.string(),
      messagePreview: z.string().optional(),
    })
  ),
});

type ProjectNewConversationEmailTemplateProps = z.infer<
  typeof ProjectNewConversationEmailTemplatePropsSchema
>;

const ProjectNewConversationEmailTemplate = ({
  name,
  workspace,
  projectCount,
  conversations,
}: ProjectNewConversationEmailTemplateProps) => {
  return (
    <EmailLayout workspace={workspace}>
      <p>Hi {name},</p>
      <p>
        {projectCount === 1
          ? conversations.length === 1
            ? `There's a new conversation in ${conversations[0].projectName}:`
            : `There are ${conversations.length} new conversations in ${conversations[0].projectName}:`
          : `There are ${conversations.length} new conversations in your projects:`}
      </p>
      <div>
        {conversations.map((conversation) => (
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
                {conversation.createdByFullName} started "{conversation.title}"{" "}
                {projectCount > 1 && `in ${conversation.projectName}`}
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
    </EmailLayout>
  );
};

export function renderEmail(args: ProjectNewConversationEmailTemplateProps) {
  return render(<ProjectNewConversationEmailTemplate {...args} />);
}
